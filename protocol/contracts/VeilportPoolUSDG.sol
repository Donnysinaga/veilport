// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./VeilportBasePool.sol";

interface IERC20Minimal {
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

/**
 * @title VeilportPoolUSDG
 * @notice Shielded pool implementation for ERC-20 USDG token deposits and withdrawals.
 */
contract VeilportPoolUSDG is VeilportBasePool {
    IERC20Minimal public immutable token;

    error NoNativeValueAllowed();
    error SafeTransferFromFailed();
    error SafeTransferFailed();

    constructor(
        address _verifier,
        address _hasher,
        uint256 _denomination,
        address _token
    ) VeilportBasePool(_verifier, _hasher, _denomination) {
        require(_token != address(0), "Invalid token address");
        token = IERC20Minimal(_token);
    }

    /**
     * @dev Transfers tokens from depositor to this pool using safe ERC-20 transferFrom.
     */
    function _processDeposit() internal override {
        if (msg.value != 0) revert NoNativeValueAllowed();

        _safeTransferFrom(msg.sender, address(this), denomination);
    }

    /**
     * @dev Transfers tokens to recipient and relayer using safe ERC-20 transfer.
     */
    function _processWithdraw(
        address payable recipient,
        address payable relayer,
        uint256 fee
    ) internal override {
        uint256 netPayout = denomination - fee;

        _safeTransfer(recipient, netPayout);

        if (fee > 0) {
            _safeTransfer(relayer, fee);
        }
    }

    function _safeTransfer(address to, uint256 value) internal {
        (bool success, bytes memory data) = address(token).call(
            abi.encodeWithSelector(IERC20Minimal.transfer.selector, to, value)
        );
        if (!success || (data.length != 0 && !abi.decode(data, (bool)))) {
            revert SafeTransferFailed();
        }
    }

    function _safeTransferFrom(address from, address to, uint256 value) internal {
        (bool success, bytes memory data) = address(token).call(
            abi.encodeWithSelector(IERC20Minimal.transferFrom.selector, from, to, value)
        );
        if (!success || (data.length != 0 && !abi.decode(data, (bool)))) {
            revert SafeTransferFromFailed();
        }
    }
}
