// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @dev Minimal ERC-20 surface used by this contract.
interface IERC20Gift {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title Makoto Gifts ("lì xì" links)
/// @notice Put USDC or EURC into a gift, share a link, friends claim their share.
///         - The link carries a one-time claim key. The contract only stores the key's
///           address (`claimSigner`); a claim must carry a signature by that key over
///           (chain, contract, gift id, recipient), so a claim can be submitted by anyone
///           (e.g. a fee relayer) but always pays the signed recipient.
///         - Each address can claim once per gift. Shares are fixed at creation
///           (equal or "lucky" random amounts chosen by the creator's app).
///         - The creator can take back whatever is left at any time (`refund`).
///         - No owner, no admin, no upgrade path, no fees. Only the two stablecoins fixed
///           at deployment (USDC and EURC on Arc) are accepted.
contract MakotoGifts {
    struct Gift {
        address creator; // funded the gift; may refund the remainder
        uint96 total; // sum of all shares, in token units
        address token; // one of the two allowlisted stablecoins
        uint96 claimedAmount; // paid out so far
        address claimSigner; // address of the one-time key inside the link
        uint64 expiresAt; // unix seconds; claims stop after this
        uint32 shareCount; // number of shares
        uint32 claimedCount; // shares claimed so far
        bool refunded; // remainder returned to the creator; no more claims
    }

    enum Status {
        Open,
        Empty,
        Refunded,
        Expired
    }

    uint256 public constant MAX_SHARES = 50;
    uint256 public constant MAX_MEMO_BYTES = 140;
    uint256 public constant MAX_DURATION = 30 days;

    address public immutable tokenA;
    address public immutable tokenB;

    uint256 public giftCount;
    mapping(uint256 => Gift) private _gifts;
    mapping(uint256 => uint96[]) private _shares;
    mapping(uint256 => address[]) private _claimers;
    mapping(uint256 => string) private _memos;
    mapping(uint256 => mapping(address => bool)) public hasClaimed;

    event GiftCreated(
        uint256 indexed id,
        address indexed creator,
        address indexed token,
        uint256 total,
        uint32 shareCount,
        address claimSigner,
        uint64 expiresAt,
        string memo
    );
    event Claimed(uint256 indexed id, address indexed recipient, uint256 amount, uint32 claimedCount);
    event Refunded(uint256 indexed id, address indexed creator, uint256 amount);

    error InvalidToken();
    error TokenNotAllowed();
    error InvalidShares();
    error InvalidSigner();
    error InvalidExpiry();
    error MemoTooLong();
    error GiftNotFound();
    error GiftRefunded();
    error GiftExpired();
    error GiftEmpty();
    error InvalidRecipient();
    error CreatorCannotClaim();
    error AlreadyClaimed();
    error BadSignature();
    error NotCreator();
    error NothingToRefund();
    error TransferFailed();

    constructor(address tokenA_, address tokenB_) {
        if (tokenA_ == address(0) || tokenB_ == address(0) || tokenA_ == tokenB_) revert InvalidToken();
        if (tokenA_.code.length == 0 || tokenB_.code.length == 0) revert InvalidToken();
        tokenA = tokenA_;
        tokenB = tokenB_;
    }

    /// @notice Fund a gift. The caller must first approve exactly the sum of `shares` of `token`.
    function createGift(address token, uint96[] calldata shares, address claimSigner, uint64 expiresAt, string calldata memo)
        external
        returns (uint256 id)
    {
        if (token != tokenA && token != tokenB) revert TokenNotAllowed();
        uint256 n = shares.length;
        if (n == 0 || n > MAX_SHARES) revert InvalidShares();
        uint256 total;
        for (uint256 i; i < n; ++i) {
            if (shares[i] == 0) revert InvalidShares();
            total += shares[i];
        }
        if (total > type(uint96).max) revert InvalidShares();
        if (claimSigner == address(0) || claimSigner == msg.sender) revert InvalidSigner();
        if (expiresAt <= block.timestamp || expiresAt > block.timestamp + MAX_DURATION) revert InvalidExpiry();
        if (bytes(memo).length > MAX_MEMO_BYTES) revert MemoTooLong();

        id = ++giftCount;
        _gifts[id] = Gift({
            creator: msg.sender,
            total: uint96(total),
            token: token,
            claimedAmount: 0,
            claimSigner: claimSigner,
            expiresAt: expiresAt,
            shareCount: uint32(n),
            claimedCount: 0,
            refunded: false
        });
        _shares[id] = shares;
        if (bytes(memo).length != 0) _memos[id] = memo;

        _safeTransferFrom(token, msg.sender, address(this), total);
        emit GiftCreated(id, msg.sender, token, total, uint32(n), claimSigner, expiresAt, memo);
    }

    /// @notice Claim the next share of a gift for `recipient`.
    /// @param signature 65-byte signature by the link key over `claimHash(id, recipient)` (EIP-191 personal_sign).
    function claim(uint256 id, address recipient, bytes calldata signature) external returns (uint256 amount) {
        Gift storage g = _gifts[id];
        if (g.creator == address(0)) revert GiftNotFound();
        if (g.refunded) revert GiftRefunded();
        if (block.timestamp > g.expiresAt) revert GiftExpired();
        if (g.claimedCount >= g.shareCount) revert GiftEmpty();
        if (recipient == address(0)) revert InvalidRecipient();
        if (recipient == g.creator) revert CreatorCannotClaim();
        if (hasClaimed[id][recipient]) revert AlreadyClaimed();
        if (_recover(_ethSigned(claimHash(id, recipient)), signature) != g.claimSigner) revert BadSignature();

        // Effects before the external call (checks-effects-interactions).
        uint32 index = g.claimedCount;
        amount = _shares[id][index];
        hasClaimed[id][recipient] = true;
        g.claimedCount = index + 1;
        g.claimedAmount += uint96(amount);
        _claimers[id].push(recipient);

        _safeTransfer(g.token, recipient, amount);
        emit Claimed(id, recipient, amount, index + 1);
    }

    /// @notice Creator takes back everything not claimed yet. Ends the gift.
    function refund(uint256 id) external returns (uint256 amount) {
        Gift storage g = _gifts[id];
        if (g.creator == address(0)) revert GiftNotFound();
        if (msg.sender != g.creator) revert NotCreator();
        if (g.refunded) revert GiftRefunded();
        amount = uint256(g.total) - g.claimedAmount;
        if (amount == 0) revert NothingToRefund();
        g.refunded = true;
        _safeTransfer(g.token, msg.sender, amount);
        emit Refunded(id, msg.sender, amount);
    }

    /// @notice The message the link key signs (wrapped with the EIP-191 personal_sign prefix).
    function claimHash(uint256 id, address recipient) public view returns (bytes32) {
        return keccak256(abi.encode(keccak256("MakotoGift.claim"), block.chainid, address(this), id, recipient));
    }

    function getGift(uint256 id)
        external
        view
        returns (Gift memory gift, string memory memo, uint96[] memory shares, address[] memory claimers, Status status)
    {
        gift = _gifts[id];
        if (gift.creator == address(0)) revert GiftNotFound();
        memo = _memos[id];
        shares = _shares[id];
        claimers = _claimers[id];
        status = _status(gift);
    }

    function _status(Gift memory g) private view returns (Status) {
        if (g.refunded) return Status.Refunded;
        if (g.claimedCount >= g.shareCount) return Status.Empty;
        if (block.timestamp > g.expiresAt) return Status.Expired;
        return Status.Open;
    }

    function _ethSigned(bytes32 digest) private pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));
    }

    function _recover(bytes32 digest, bytes calldata sig) private pure returns (address signer) {
        if (sig.length != 65) revert BadSignature();
        bytes32 r = bytes32(sig[0:32]);
        bytes32 s = bytes32(sig[32:64]);
        uint8 v = uint8(sig[64]);
        if (v < 27) v += 27;
        // Reject malleable (high-s) signatures.
        if (v != 27 && v != 28) revert BadSignature();
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) revert BadSignature();
        signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) revert BadSignature();
    }

    /// @dev Supports tokens that return nothing or a bool.
    function _safeTransfer(address token, address to, uint256 amount) private {
        (bool ok, bytes memory data) = token.call(abi.encodeWithSelector(IERC20Gift.transfer.selector, to, amount));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }

    function _safeTransferFrom(address token, address from, address to, uint256 amount) private {
        (bool ok, bytes memory data) = token.call(abi.encodeWithSelector(IERC20Gift.transferFrom.selector, from, to, amount));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }
}
