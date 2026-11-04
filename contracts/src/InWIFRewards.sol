// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/// @title InWIFRewards
/// @notice Optional, transparently funded ecosystem reward campaigns (e.g. for
///         security tutorials, community quests, hackathon participation).
///
/// Design principles:
///  - This contract never gates any InWIF wallet feature. It only distributes.
///  - A campaign can only pay out what has actually been deposited for it:
///    `claimed <= funded` per campaign, always. No promised-but-unfunded rewards.
///  - Funding is public: anyone can fund, every deposit emits `CampaignFunded`.
///  - Allocations are committed up-front as a Merkle root of
///    (campaignId, account, amount) leaves, built with OpenZeppelin's
///    StandardMerkleTree (double-hashed leaves, sorted pairs).
///  - Unclaimed funds can only be withdrawn after the campaign deadline, so
///    the operator cannot pull funds out from under eligible claimants.
///  - No fees, no burns, no hidden deductions: claimants receive the full amount.
///
/// @dev UNAUDITED. Do not deploy to mainnet until an independent audit is complete.
///      The deploy script refuses Robinhood Chain mainnet (4663).
contract InWIFRewards is AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant CAMPAIGN_MANAGER_ROLE = keccak256("CAMPAIGN_MANAGER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    struct Campaign {
        IERC20 token;
        bytes32 merkleRoot;
        uint256 funded;
        uint256 claimed;
        uint64 claimDeadline;
        bool active;
        string metadataURI;
    }

    uint256 public campaignCount;
    mapping(uint256 id => Campaign) public campaigns;
    mapping(uint256 id => mapping(address account => bool)) public hasClaimed;
    /// @notice Total outstanding (funded - claimed - withdrawn) per token across all campaigns.
    mapping(IERC20 token => uint256) public liabilities;

    event CampaignCreated(
        uint256 indexed id, address indexed token, bytes32 merkleRoot, uint64 claimDeadline, string metadataURI
    );
    event CampaignFunded(uint256 indexed id, address indexed funder, uint256 amount);
    event Claimed(uint256 indexed id, address indexed account, uint256 amount);
    event CampaignClosed(uint256 indexed id);
    event UnclaimedWithdrawn(uint256 indexed id, address indexed to, uint256 amount);

    error InvalidToken();
    error InvalidRoot();
    error InvalidDeadline();
    error UnknownCampaign();
    error CampaignInactive();
    error ClaimWindowClosed();
    error ClaimWindowOpen();
    error AlreadyClaimed();
    error InvalidProof();
    error InsufficientFunding();
    error ZeroAmount();
    error InvalidRecipient();

    constructor(address admin) {
        if (admin == address(0)) revert InvalidRecipient();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(CAMPAIGN_MANAGER_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
    }

    // ---------------------------------------------------------------------
    // Campaign management
    // ---------------------------------------------------------------------

    function createCampaign(IERC20 token, bytes32 merkleRoot, uint64 claimDeadline, string calldata metadataURI)
        external
        onlyRole(CAMPAIGN_MANAGER_ROLE)
        returns (uint256 id)
    {
        if (address(token) == address(0) || address(token).code.length == 0) revert InvalidToken();
        if (merkleRoot == bytes32(0)) revert InvalidRoot();
        if (claimDeadline <= block.timestamp) revert InvalidDeadline();

        id = ++campaignCount;
        campaigns[id] = Campaign({
            token: token,
            merkleRoot: merkleRoot,
            funded: 0,
            claimed: 0,
            claimDeadline: claimDeadline,
            active: true,
            metadataURI: metadataURI
        });
        emit CampaignCreated(id, address(token), merkleRoot, claimDeadline, metadataURI);
    }

    /// @notice Deposit reward tokens for a campaign. Anyone may fund; deposits are public.
    /// @dev Credits the actual balance increase, so fee-on-transfer tokens cannot over-credit.
    function fund(uint256 id, uint256 amount) external nonReentrant whenNotPaused {
        Campaign storage c = _campaign(id);
        if (!c.active) revert CampaignInactive();
        if (block.timestamp > c.claimDeadline) revert ClaimWindowClosed();
        if (amount == 0) revert ZeroAmount();

        uint256 beforeBal = c.token.balanceOf(address(this));
        c.token.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = c.token.balanceOf(address(this)) - beforeBal;
        if (received == 0) revert ZeroAmount();

        c.funded += received;
        liabilities[c.token] += received;
        emit CampaignFunded(id, msg.sender, received);
    }

    // ---------------------------------------------------------------------
    // Claims
    // ---------------------------------------------------------------------

    function claim(uint256 id, uint256 amount, bytes32[] calldata proof) external nonReentrant whenNotPaused {
        Campaign storage c = _campaign(id);
        if (!c.active) revert CampaignInactive();
        if (block.timestamp > c.claimDeadline) revert ClaimWindowClosed();
        if (amount == 0) revert ZeroAmount();
        if (hasClaimed[id][msg.sender]) revert AlreadyClaimed();

        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(id, msg.sender, amount))));
        if (!MerkleProof.verifyCalldata(proof, c.merkleRoot, leaf)) revert InvalidProof();
        if (c.claimed + amount > c.funded) revert InsufficientFunding();

        // Effects
        hasClaimed[id][msg.sender] = true;
        c.claimed += amount;
        liabilities[c.token] -= amount;

        // Interaction
        c.token.safeTransfer(msg.sender, amount);
        emit Claimed(id, msg.sender, amount);
    }

    function isEligible(uint256 id, address account, uint256 amount, bytes32[] calldata proof)
        external
        view
        returns (bool)
    {
        Campaign storage c = campaigns[id];
        if (address(c.token) == address(0) || hasClaimed[id][account]) return false;
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(id, account, amount))));
        return MerkleProof.verifyCalldata(proof, c.merkleRoot, leaf);
    }

    function remaining(uint256 id) external view returns (uint256) {
        Campaign storage c = campaigns[id];
        return c.funded - c.claimed;
    }

    // ---------------------------------------------------------------------
    // Closing
    // ---------------------------------------------------------------------

    /// @notice After the deadline, return unclaimed funds to `to` (e.g. the funding treasury). Public event.
    function withdrawUnclaimed(uint256 id, address to) external nonReentrant onlyRole(DEFAULT_ADMIN_ROLE) {
        Campaign storage c = _campaign(id);
        if (block.timestamp <= c.claimDeadline) revert ClaimWindowOpen();
        if (to == address(0)) revert InvalidRecipient();

        uint256 amount = c.funded - c.claimed;
        c.active = false;
        // Treat the withdrawn remainder as settled so `claimed == funded` after close.
        c.funded = c.claimed;
        liabilities[c.token] -= amount;
        emit CampaignClosed(id);

        if (amount > 0) {
            c.token.safeTransfer(to, amount);
            emit UnclaimedWithdrawn(id, to, amount);
        }
    }

    // ---------------------------------------------------------------------
    // Emergency
    // ---------------------------------------------------------------------

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function _campaign(uint256 id) private view returns (Campaign storage c) {
        c = campaigns[id];
        if (address(c.token) == address(0)) revert UnknownCampaign();
    }
}
