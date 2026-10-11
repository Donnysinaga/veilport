// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./VeilportBasePool.sol";

/**
 * @title VeilportPoolETH
 * @notice Shielded pool implementation for native Ether deposits and withdrawals.
 */
contract VeilportPoolETH is VeilportBasePool {
    error IncorrectDepositAmount();
    error NativeTransferFailed();

    constructor(
        address _verifier,
        address _hasher,
        uint256 _denomination
    ) VeilportBasePool(_verifier, _hasher, _denomination) {}

    /**
     * @dev Enforces that msg.value exactly matches the fixed denomination.
     */
    function _processDeposit() internal override {
        if (msg.value != denomination) revert IncorrectDepositAmount();
    }

    /**
     * @dev Transfers native Ether to recipient and relayer via low-level call.
     */
    function _processWithdraw(
        address payable recipient,
        address payable relayer,
        uint256 fee
    ) internal override {
        uint256 netPayout = denomination - fee;

        (bool successRecipient, ) = recipient.call{value: netPayout}("");
        if (!successRecipient) revert NativeTransferFailed();

        if (fee > 0) {
            (bool successRelayer, ) = relayer.call{value: fee}("");
            if (!successRelayer) revert NativeTransferFailed();
        }
    }
}
