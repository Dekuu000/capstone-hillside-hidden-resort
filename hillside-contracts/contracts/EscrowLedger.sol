// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract EscrowLedger {
    address public operator;

    enum EscrowState {
        None,
        Locked,
        Released,
        Refunded
    }

    struct EscrowRecord {
        address payer;
        address recipient;
        address asset;
        uint256 amount;
        EscrowState state;
        uint64 createdAt;
    }

    mapping(bytes32 => EscrowRecord) public escrows;

    event EscrowLocked(
        bytes32 indexed bookingId,
        uint256 amount,
        address indexed payer,
        address asset,
        uint256 timestamp
    );

    event EscrowReleased(
        bytes32 indexed bookingId,
        address indexed recipient,
        uint256 amount,
        uint256 timestamp
    );

    event EscrowRefunded(
        bytes32 indexed bookingId,
        address indexed payer,
        uint256 amount,
        uint256 timestamp
    );

    modifier onlyOperator() {
        require(msg.sender == operator, "operator only");
        _;
    }

    constructor() {
        operator = msg.sender;
    }

    function setOperator(address nextOperator) external onlyOperator {
        require(nextOperator != address(0), "invalid operator");
        operator = nextOperator;
    }

    function lock(bytes32 bookingId, address recipient) external payable {
        require(bookingId != bytes32(0), "invalid booking");
        require(recipient != address(0), "invalid recipient");
        require(msg.value > 0, "amount required");
        require(escrows[bookingId].state == EscrowState.None, "already exists");

        escrows[bookingId] = EscrowRecord({
            payer: msg.sender,
            recipient: recipient,
            asset: address(0),
            amount: msg.value,
            state: EscrowState.Locked,
            createdAt: uint64(block.timestamp)
        });

        emit EscrowLocked(bookingId, msg.value, msg.sender, address(0), block.timestamp);
    }

    function release(bytes32 bookingId) external onlyOperator {
        EscrowRecord storage record = escrows[bookingId];
        require(record.state == EscrowState.Locked, "not locked");

        uint256 amount = record.amount;
        record.state = EscrowState.Released;
        record.amount = 0;
        payable(record.recipient).transfer(amount);

        emit EscrowReleased(bookingId, record.recipient, amount, block.timestamp);
    }

    function refund(bytes32 bookingId) external onlyOperator {
        EscrowRecord storage record = escrows[bookingId];
        require(record.state == EscrowState.Locked, "not locked");

        uint256 amount = record.amount;
        record.state = EscrowState.Refunded;
        record.amount = 0;
        payable(record.payer).transfer(amount);

        emit EscrowRefunded(bookingId, record.payer, amount, block.timestamp);
    }
}
