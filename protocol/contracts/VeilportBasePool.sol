// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./MerkleTreeWithHistory.sol";
import "./interfaces/IVerifier.sol";

/**
 * @title VeilportBasePool
 * @notice Abstract foundation for VEILPORT shielded asset pools.
 * @dev Enforces discrete fixed denominations, nullifier uniqueness, Merkle root validity,
 *      and cryptographic zero-knowledge proof verification.
 */
abstract contract VeilportBasePool is MerkleTreeWithHistory {
    IVerifier public immutable verifier;
    uint256 public immutable denomination;

    address public owner;
    bool public paused;
    uint256 private _status; // Reentrancy guard status

    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;

    // Registry of spent nullifiers to prevent double-spending
    mapping(bytes32 => bool) public nullifierSpent;

    event Deposit(bytes32 indexed commitment, uint32 indexed leafIndex, uint256 timestamp);
    event Withdrawal(
        address indexed recipient,
        bytes32 indexed nullifierHash,
        address indexed relayer,
        uint256 fee
    );
    event Paused(address account);
    event Unpaused(address account);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error ReentrancyGuardReentrantCall();
    error ContractIsPaused();
    error OnlyOwner();
    error InvalidVerifier();
    error InvalidDenomination();
    error InvalidFee();
    error InvalidProof();
    error InvalidMerkleRoot();
    error NullifierAlreadySpent();
    error FieldElementOverflow();

    modifier nonReentrant() {
        if (_status == _ENTERED) revert ReentrancyGuardReentrantCall();
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }

    modifier whenNotPaused() {
        if (paused) revert ContractIsPaused();
        _;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    constructor(
        address _verifier,
        address _hasher,
        uint256 _denomination
    ) MerkleTreeWithHistory(_hasher) {
        if (_verifier == address(0)) revert InvalidVerifier();
        if (_denomination == 0) revert InvalidDenomination();

        verifier = IVerifier(_verifier);
        denomination = _denomination;
        owner = msg.sender;
        _status = _NOT_ENTERED;
        paused = false;

        emit OwnershipTransferred(address(0), msg.sender);
    }

    /**
     * @notice Deposit funds into the shielded pool with a secret cryptographic commitment.
     * @param commitment The Poseidon hash of (nullifierSecret, secret).
     */
    function deposit(bytes32 commitment) external payable nonReentrant whenNotPaused {
        if (uint256(commitment) >= FIELD_SIZE) revert FieldElementOverflow();

        _processDeposit();
        uint32 leafIndex = _insert(commitment);

        emit Deposit(commitment, leafIndex, block.timestamp);
    }

    /**
     * @notice Withdraw funds from the shielded pool using a valid zero-knowledge proof.
     * @param proof The serialized Groth16 cryptographic proof.
     * @param root The Merkle root asserted by the proof.
     * @param nullifierHash The unique nullifier hash preventing double-spending.
     * @param recipient The address receiving unshielded funds.
     * @param relayer The address receiving the relayer fee.
     * @param fee The fee amount allocated to the relayer (fee <= denomination).
     */
    function withdraw(
        bytes calldata proof,
        bytes32 root,
        bytes32 nullifierHash,
        address payable recipient,
        address payable relayer,
        uint256 fee
    ) external nonReentrant whenNotPaused {
        if (fee > denomination) revert InvalidFee();
        if (nullifierSpent[nullifierHash]) revert NullifierAlreadySpent();
        if (!isKnownRoot(root)) revert InvalidMerkleRoot();
        if (uint256(nullifierHash) >= FIELD_SIZE) revert FieldElementOverflow();
        if (recipient == address(0)) revert InvalidFee();

        // Bind public inputs: [root, nullifierHash, recipient, relayer, fee]
        uint256[5] memory publicInputs = [
            uint256(root),
            uint256(nullifierHash),
            uint256(uint160(address(recipient))),
            uint256(uint160(address(relayer))),
            fee
        ];

        if (!verifier.verifyProof(proof, publicInputs)) {
            revert InvalidProof();
        }

        // Mark nullifier as spent before transferring funds (checks-effects-interactions)
        nullifierSpent[nullifierHash] = true;

        _processWithdraw(recipient, relayer, fee);

        emit Withdrawal(recipient, nullifierHash, relayer, fee);
    }

    function pause() external onlyOwner {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "New owner is zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /**
     * @dev Process incoming asset deposit in the derived pool implementation.
     */
    function _processDeposit() internal virtual;

    /**
     * @dev Process outgoing asset withdrawal in the derived pool implementation.
     */
    function _processWithdraw(
        address payable recipient,
        address payable relayer,
        uint256 fee
    ) internal virtual;
}
