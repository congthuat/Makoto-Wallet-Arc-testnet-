// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {MakotoGifts} from "../src/MakotoGifts.sol";

contract GiftStable {
    uint8 public constant decimals = 6;
    bool public failTransfers;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }
    function setFail(bool value) external { failTransfers = value; }
    function approve(address spender, uint256 amount) external returns (bool) { allowance[msg.sender][spender] = amount; return true; }
    function transfer(address to, uint256 amount) external returns (bool) {
        if (failTransfers) return false;
        require(balanceOf[msg.sender] >= amount, "balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        if (failTransfers) return false;
        require(allowance[from][msg.sender] >= amount, "allowance");
        require(balanceOf[from] >= amount, "balance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract MakotoGiftsTest is Test {
    MakotoGifts internal gifts;
    GiftStable internal usdc;
    GiftStable internal eurc;
    GiftStable internal other;
    address internal creator = makeAddr("creator");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal relayer = makeAddr("relayer");
    uint256 internal linkKey = 0xA11CE;
    address internal linkSigner;

    function setUp() public {
        usdc = new GiftStable();
        eurc = new GiftStable();
        other = new GiftStable();
        gifts = new MakotoGifts(address(usdc), address(eurc));
        linkSigner = vm.addr(linkKey);
        usdc.mint(creator, 1_000e6);
        eurc.mint(creator, 1_000e6);
        vm.warp(1_800_000_000);
    }

    function _shares3() internal pure returns (uint96[] memory s) {
        s = new uint96[](3);
        s[0] = 5e6; s[1] = 3e6; s[2] = 2e6;
    }

    function _create(uint96[] memory shares) internal returns (uint256 id) {
        uint256 total;
        for (uint256 i; i < shares.length; ++i) total += shares[i];
        vm.startPrank(creator);
        usdc.approve(address(gifts), total);
        id = gifts.createGift(address(usdc), shares, linkSigner, uint64(block.timestamp + 7 days), unicode"Chúc mừng năm mới");
        vm.stopPrank();
    }

    function _sig(uint256 key, uint256 id, address recipient) internal view returns (bytes memory) {
        bytes32 digest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", gifts.claimHash(id, recipient)));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function test_createPullsFunds() public {
        uint256 id = _create(_shares3());
        assertEq(id, 1);
        assertEq(usdc.balanceOf(address(gifts)), 10e6);
        assertEq(usdc.balanceOf(creator), 990e6);
        (MakotoGifts.Gift memory g, string memory memo, uint96[] memory shares, address[] memory claimers, MakotoGifts.Status st) = gifts.getGift(id);
        assertEq(g.creator, creator);
        assertEq(g.total, 10e6);
        assertEq(g.shareCount, 3);
        assertEq(g.claimSigner, linkSigner);
        assertEq(memo, unicode"Chúc mừng năm mới");
        assertEq(shares.length, 3);
        assertEq(claimers.length, 0);
        assertEq(uint256(st), uint256(MakotoGifts.Status.Open));
    }

    function test_claimViaRelayerPaysRecipientInOrder() public {
        uint256 id = _create(_shares3());
        bytes memory sigA = _sig(linkKey, id, alice);
        vm.prank(relayer);
        assertEq(gifts.claim(id, alice, sigA), 5e6);
        assertEq(usdc.balanceOf(alice), 5e6);
        assertEq(usdc.balanceOf(relayer), 0);
        vm.prank(bob);
        assertEq(gifts.claim(id, bob, _sig(linkKey, id, bob)), 3e6);
        (MakotoGifts.Gift memory g,,, address[] memory claimers,) = gifts.getGift(id);
        assertEq(g.claimedCount, 2);
        assertEq(g.claimedAmount, 8e6);
        assertEq(claimers[0], alice);
        assertEq(claimers[1], bob);
    }

    function test_claimTwiceReverts() public {
        uint256 id = _create(_shares3());
        bytes memory sig = _sig(linkKey, id, alice);
        gifts.claim(id, alice, sig);
        vm.expectRevert(MakotoGifts.AlreadyClaimed.selector);
        gifts.claim(id, alice, sig);
    }

    function test_signatureBoundToRecipient() public {
        uint256 id = _create(_shares3());
        bytes memory sigA = _sig(linkKey, id, alice);
        vm.expectRevert(MakotoGifts.BadSignature.selector);
        gifts.claim(id, bob, sigA); // a front-runner cannot redirect Alice's claim
    }

    function test_wrongKeyReverts() public {
        uint256 id = _create(_shares3());
        bytes memory sig = _sig(0xB0B, id, alice);
        vm.expectRevert(MakotoGifts.BadSignature.selector);
        gifts.claim(id, alice, sig);
    }

    function test_signatureBoundToGiftId() public {
        uint256 id1 = _create(_shares3());
        uint256 id2 = _create(_shares3());
        bytes memory sig1 = _sig(linkKey, id1, alice);
        vm.expectRevert(MakotoGifts.BadSignature.selector);
        assertTrue(id1 != id2);
        gifts.claim(id2, alice, sig1); // same key, other gift: hash differs
    }

    function test_highSRejected() public {
        uint256 id = _create(_shares3());
        bytes32 digest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", gifts.claimHash(id, alice)));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(linkKey, digest);
        uint256 n = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;
        bytes memory flipped = abi.encodePacked(r, bytes32(n - uint256(s)), v == 27 ? uint8(28) : uint8(27));
        vm.expectRevert(MakotoGifts.BadSignature.selector);
        gifts.claim(id, alice, flipped);
    }

    function test_emptyAfterAllShares() public {
        uint256 id = _create(_shares3());
        gifts.claim(id, alice, _sig(linkKey, id, alice));
        gifts.claim(id, bob, _sig(linkKey, id, bob));
        address carol = makeAddr("carol");
        gifts.claim(id, carol, _sig(linkKey, id, carol));
        assertEq(usdc.balanceOf(address(gifts)), 0);
        address dave = makeAddr("dave");
        bytes memory sig = _sig(linkKey, id, dave);
        vm.expectRevert(MakotoGifts.GiftEmpty.selector);
        gifts.claim(id, dave, sig);
        (,,,, MakotoGifts.Status st) = gifts.getGift(id);
        assertEq(uint256(st), uint256(MakotoGifts.Status.Empty));
        vm.prank(creator);
        vm.expectRevert(MakotoGifts.NothingToRefund.selector);
        gifts.refund(id);
    }

    function test_creatorCannotClaim() public {
        uint256 id = _create(_shares3());
        bytes memory sig = _sig(linkKey, id, creator);
        vm.expectRevert(MakotoGifts.CreatorCannotClaim.selector);
        gifts.claim(id, creator, sig);
    }

    function test_refundRemainderEndsGift() public {
        uint256 id = _create(_shares3());
        gifts.claim(id, alice, _sig(linkKey, id, alice));
        vm.prank(alice);
        vm.expectRevert(MakotoGifts.NotCreator.selector);
        gifts.refund(id);
        vm.prank(creator);
        assertEq(gifts.refund(id), 5e6);
        assertEq(usdc.balanceOf(creator), 995e6);
        assertEq(usdc.balanceOf(address(gifts)), 0);
        bytes memory sig = _sig(linkKey, id, bob);
        vm.expectRevert(MakotoGifts.GiftRefunded.selector);
        gifts.claim(id, bob, sig);
        vm.prank(creator);
        vm.expectRevert(MakotoGifts.GiftRefunded.selector);
        gifts.refund(id);
    }

    function test_expiredClaimRevertsButRefundWorks() public {
        uint256 id = _create(_shares3());
        vm.warp(block.timestamp + 7 days + 1);
        bytes memory sig = _sig(linkKey, id, alice);
        vm.expectRevert(MakotoGifts.GiftExpired.selector);
        gifts.claim(id, alice, sig);
        (,,,, MakotoGifts.Status st) = gifts.getGift(id);
        assertEq(uint256(st), uint256(MakotoGifts.Status.Expired));
        vm.prank(creator);
        assertEq(gifts.refund(id), 10e6);
    }

    function test_createValidation() public {
        uint96[] memory none = new uint96[](0);
        vm.startPrank(creator);
        usdc.approve(address(gifts), type(uint256).max);
        vm.expectRevert(MakotoGifts.TokenNotAllowed.selector);
        gifts.createGift(address(other), _shares3(), linkSigner, uint64(block.timestamp + 1 days), "");
        vm.expectRevert(MakotoGifts.InvalidShares.selector);
        gifts.createGift(address(usdc), none, linkSigner, uint64(block.timestamp + 1 days), "");
        uint96[] memory zero = new uint96[](2);
        zero[0] = 1e6;
        vm.expectRevert(MakotoGifts.InvalidShares.selector);
        gifts.createGift(address(usdc), zero, linkSigner, uint64(block.timestamp + 1 days), "");
        uint96[] memory many = new uint96[](51);
        for (uint256 i; i < 51; ++i) many[i] = 1;
        vm.expectRevert(MakotoGifts.InvalidShares.selector);
        gifts.createGift(address(usdc), many, linkSigner, uint64(block.timestamp + 1 days), "");
        vm.expectRevert(MakotoGifts.InvalidSigner.selector);
        gifts.createGift(address(usdc), _shares3(), address(0), uint64(block.timestamp + 1 days), "");
        vm.expectRevert(MakotoGifts.InvalidSigner.selector);
        gifts.createGift(address(usdc), _shares3(), creator, uint64(block.timestamp + 1 days), "");
        vm.expectRevert(MakotoGifts.InvalidExpiry.selector);
        gifts.createGift(address(usdc), _shares3(), linkSigner, uint64(block.timestamp), "");
        vm.expectRevert(MakotoGifts.InvalidExpiry.selector);
        gifts.createGift(address(usdc), _shares3(), linkSigner, uint64(block.timestamp + 31 days), "");
        vm.expectRevert(MakotoGifts.MemoTooLong.selector);
        gifts.createGift(address(usdc), _shares3(), linkSigner, uint64(block.timestamp + 1 days), string(new bytes(141)));
        vm.stopPrank();
    }

    function test_failedTransferReverts() public {
        vm.startPrank(creator);
        usdc.approve(address(gifts), 10e6);
        usdc.setFail(true);
        vm.expectRevert(MakotoGifts.TransferFailed.selector);
        gifts.createGift(address(usdc), _shares3(), linkSigner, uint64(block.timestamp + 1 days), "");
        vm.stopPrank();
    }

    function test_unknownGift() public {
        vm.expectRevert(MakotoGifts.GiftNotFound.selector);
        gifts.getGift(9);
        vm.expectRevert(MakotoGifts.GiftNotFound.selector);
        gifts.claim(9, alice, "");
    }

    function testFuzz_sharesSumAndPayout(uint8 count, uint64 seed) public {
        uint256 n = bound(count, 1, 50);
        uint96[] memory shares = new uint96[](n);
        uint256 total;
        for (uint256 i; i < n; ++i) {
            shares[i] = uint96(bound(uint256(keccak256(abi.encode(seed, i))), 1, 10e6));
            total += shares[i];
        }
        usdc.mint(creator, total);
        uint256 id = _create(shares);
        uint256 paid;
        for (uint256 i; i < n; ++i) {
            address who = address(uint160(0x1000 + i));
            paid += gifts.claim(id, who, _sig(linkKey, id, who));
        }
        assertEq(paid, total);
        assertEq(usdc.balanceOf(address(gifts)), 0);
    }
}
