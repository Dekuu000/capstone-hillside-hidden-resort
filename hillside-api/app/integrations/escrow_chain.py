from dataclasses import dataclass
from typing import Any

from app.core.chains import ChainConfig
from app.core.config import settings

# Minimal ABI slice required for lock + EscrowLocked event parsing.
ESCROW_LEDGER_ABI: list[dict[str, Any]] = [
    {
        "inputs": [
            {"internalType": "bytes32", "name": "bookingId", "type": "bytes32"},
            {"internalType": "address", "name": "recipient", "type": "address"},
        ],
        "name": "lock",
        "outputs": [],
        "stateMutability": "payable",
        "type": "function",
    },
    {
        "inputs": [
            {"internalType": "bytes32", "name": "bookingId", "type": "bytes32"},
        ],
        "name": "release",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    },
    {
        "inputs": [
            {"internalType": "bytes32", "name": "bookingId", "type": "bytes32"},
        ],
        "name": "refund",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    },
    {
        "inputs": [
            {"internalType": "bytes32", "name": "", "type": "bytes32"},
        ],
        "name": "escrows",
        "outputs": [
            {"internalType": "address", "name": "payer", "type": "address"},
            {"internalType": "address", "name": "recipient", "type": "address"},
            {"internalType": "address", "name": "asset", "type": "address"},
            {"internalType": "uint256", "name": "amount", "type": "uint256"},
            {
                "internalType": "enum EscrowLedger.EscrowState",
                "name": "state",
                "type": "uint8",
            },
            {"internalType": "uint64", "name": "createdAt", "type": "uint64"},
        ],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "anonymous": False,
        "inputs": [
            {
                "indexed": True,
                "internalType": "bytes32",
                "name": "bookingId",
                "type": "bytes32",
            },
            {
                "indexed": False,
                "internalType": "uint256",
                "name": "amount",
                "type": "uint256",
            },
            {
                "indexed": True,
                "internalType": "address",
                "name": "payer",
                "type": "address",
            },
            {
                "indexed": False,
                "internalType": "address",
                "name": "asset",
                "type": "address",
            },
            {
                "indexed": False,
                "internalType": "uint256",
                "name": "timestamp",
                "type": "uint256",
            },
        ],
        "name": "EscrowLocked",
        "type": "event",
    },
    {
        "anonymous": False,
        "inputs": [
            {
                "indexed": True,
                "internalType": "bytes32",
                "name": "bookingId",
                "type": "bytes32",
            },
            {
                "indexed": True,
                "internalType": "address",
                "name": "recipient",
                "type": "address",
            },
            {
                "indexed": False,
                "internalType": "uint256",
                "name": "amount",
                "type": "uint256",
            },
            {
                "indexed": False,
                "internalType": "uint256",
                "name": "timestamp",
                "type": "uint256",
            },
        ],
        "name": "EscrowReleased",
        "type": "event",
    },
    {
        "anonymous": False,
        "inputs": [
            {
                "indexed": True,
                "internalType": "bytes32",
                "name": "bookingId",
                "type": "bytes32",
            },
            {
                "indexed": True,
                "internalType": "address",
                "name": "payer",
                "type": "address",
            },
            {
                "indexed": False,
                "internalType": "uint256",
                "name": "amount",
                "type": "uint256",
            },
            {
                "indexed": False,
                "internalType": "uint256",
                "name": "timestamp",
                "type": "uint256",
            },
        ],
        "name": "EscrowRefunded",
        "type": "event",
    },
]


@dataclass(frozen=True)
class EscrowLockResult:
    tx_hash: str
    onchain_booking_id: str
    event_index: int


@dataclass(frozen=True)
class EscrowSettlementResult:
    tx_hash: str
    onchain_booking_id: str
    event_index: int


@dataclass(frozen=True)
class OnchainEscrowRecord:
    booking_id: str
    state: str
    amount_wei: int


def lock_reservation_escrow_onchain(
    *,
    chain: ChainConfig,
    reservation_id: str,
) -> EscrowLockResult:
    try:
        from eth_account import Account
        from web3 import Web3
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(
            "Missing web3 dependencies. Install/refresh hillside-api dependencies to enable on-chain escrow lock."
        ) from exc

    if not chain.rpc_url:
        raise RuntimeError("Active chain RPC URL is not configured.")
    if not chain.escrow_contract_address:
        raise RuntimeError("Active chain contract address is not configured.")
    if not chain.signer_private_key:
        raise RuntimeError("Active chain signer private key is not configured.")

    w3 = Web3(Web3.HTTPProvider(chain.rpc_url))
    if not w3.is_connected():
        raise RuntimeError(f"Unable to connect to {chain.key} RPC.")

    account = Account.from_key(chain.signer_private_key)
    recipient = Web3.to_checksum_address(account.address)
    contract_address = Web3.to_checksum_address(chain.escrow_contract_address)
    contract = w3.eth.contract(address=contract_address, abi=ESCROW_LEDGER_ABI)

    booking_id = Web3.keccak(text=reservation_id)
    nonce = w3.eth.get_transaction_count(account.address, "pending")
    max_priority_fee = w3.eth.max_priority_fee
    base_fee = w3.eth.gas_price

    tx = contract.functions.lock(booking_id, recipient).build_transaction(
        {
            "chainId": chain.chain_id,
            "nonce": nonce,
            "from": account.address,
            "value": settings.escrow_lock_amount_wei,
            "gas": 280000,
            "maxFeePerGas": base_fee + max_priority_fee,
            "maxPriorityFeePerGas": max_priority_fee,
        }
    )
    signed = account.sign_transaction(tx)
    tx_hash_bytes = w3.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3.eth.wait_for_transaction_receipt(
        tx_hash_bytes,
        timeout=settings.escrow_tx_receipt_timeout_sec,
    )

    if int(receipt.status or 0) != 1:
        raise RuntimeError("On-chain escrow lock transaction reverted.")

    event_index = 0
    try:
        events = contract.events.EscrowLocked().process_receipt(receipt)
        if events:
            event_index = int(events[0]["logIndex"])
    except Exception:  # noqa: BLE001
        # Event decoding fallback: keep tx success and default event index.
        event_index = 0

    return EscrowLockResult(
        tx_hash=Web3.to_hex(tx_hash_bytes),
        onchain_booking_id=Web3.to_hex(booking_id),
        event_index=event_index,
    )


def _resolve_booking_id_bytes(w3, reservation_id: str, onchain_booking_id: str | None):
    if onchain_booking_id and onchain_booking_id.startswith("0x"):
        booking_id_bytes32 = w3.to_bytes(hexstr=onchain_booking_id)
        booking_id_hex = onchain_booking_id.lower()
    else:
        booking_id_bytes32 = w3.keccak(text=reservation_id)
        booking_id_hex = w3.to_hex(booking_id_bytes32)
    return booking_id_bytes32, booking_id_hex


def release_reservation_escrow_onchain(
    *,
    chain: ChainConfig,
    reservation_id: str,
    onchain_booking_id: str | None,
) -> EscrowSettlementResult:
    try:
        from eth_account import Account
        from web3 import Web3
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(
            "Missing web3 dependencies. Install/refresh hillside-api dependencies to release escrow on-chain."
        ) from exc

    if not chain.rpc_url:
        raise RuntimeError("Active chain RPC URL is not configured.")
    if not chain.escrow_contract_address:
        raise RuntimeError("Active chain contract address is not configured.")
    if not chain.signer_private_key:
        raise RuntimeError("Active chain signer private key is not configured.")

    w3 = Web3(Web3.HTTPProvider(chain.rpc_url))
    if not w3.is_connected():
        raise RuntimeError(f"Unable to connect to {chain.key} RPC.")

    account = Account.from_key(chain.signer_private_key)
    contract_address = Web3.to_checksum_address(chain.escrow_contract_address)
    contract = w3.eth.contract(address=contract_address, abi=ESCROW_LEDGER_ABI)
    booking_id_bytes32, booking_id_hex = _resolve_booking_id_bytes(
        w3, reservation_id, onchain_booking_id
    )

    nonce = w3.eth.get_transaction_count(account.address, "pending")
    max_priority_fee = w3.eth.max_priority_fee
    base_fee = w3.eth.gas_price

    tx = contract.functions.release(booking_id_bytes32).build_transaction(
        {
            "chainId": chain.chain_id,
            "nonce": nonce,
            "from": account.address,
            "gas": 220000,
            "maxFeePerGas": base_fee + max_priority_fee,
            "maxPriorityFeePerGas": max_priority_fee,
        }
    )
    signed = account.sign_transaction(tx)
    tx_hash_bytes = w3.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3.eth.wait_for_transaction_receipt(
        tx_hash_bytes,
        timeout=settings.escrow_tx_receipt_timeout_sec,
    )

    if int(receipt.status or 0) != 1:
        raise RuntimeError("On-chain escrow release transaction reverted.")

    event_index = 0
    try:
        events = contract.events.EscrowReleased().process_receipt(receipt)
        if events:
            event_index = int(events[0]["logIndex"])
    except Exception:  # noqa: BLE001
        event_index = 0

    return EscrowSettlementResult(
        tx_hash=Web3.to_hex(tx_hash_bytes),
        onchain_booking_id=booking_id_hex,
        event_index=event_index,
    )


def refund_reservation_escrow_onchain(
    *,
    chain: ChainConfig,
    reservation_id: str,
    onchain_booking_id: str | None,
) -> EscrowSettlementResult:
    try:
        from eth_account import Account
        from web3 import Web3
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(
            "Missing web3 dependencies. Install/refresh hillside-api dependencies to refund escrow on-chain."
        ) from exc

    if not chain.rpc_url:
        raise RuntimeError("Active chain RPC URL is not configured.")
    if not chain.escrow_contract_address:
        raise RuntimeError("Active chain contract address is not configured.")
    if not chain.signer_private_key:
        raise RuntimeError("Active chain signer private key is not configured.")

    w3 = Web3(Web3.HTTPProvider(chain.rpc_url))
    if not w3.is_connected():
        raise RuntimeError(f"Unable to connect to {chain.key} RPC.")

    account = Account.from_key(chain.signer_private_key)
    contract_address = Web3.to_checksum_address(chain.escrow_contract_address)
    contract = w3.eth.contract(address=contract_address, abi=ESCROW_LEDGER_ABI)
    booking_id_bytes32, booking_id_hex = _resolve_booking_id_bytes(
        w3, reservation_id, onchain_booking_id
    )

    nonce = w3.eth.get_transaction_count(account.address, "pending")
    max_priority_fee = w3.eth.max_priority_fee
    base_fee = w3.eth.gas_price

    tx = contract.functions.refund(booking_id_bytes32).build_transaction(
        {
            "chainId": chain.chain_id,
            "nonce": nonce,
            "from": account.address,
            "gas": 220000,
            "maxFeePerGas": base_fee + max_priority_fee,
            "maxPriorityFeePerGas": max_priority_fee,
        }
    )
    signed = account.sign_transaction(tx)
    tx_hash_bytes = w3.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3.eth.wait_for_transaction_receipt(
        tx_hash_bytes,
        timeout=settings.escrow_tx_receipt_timeout_sec,
    )

    if int(receipt.status or 0) != 1:
        raise RuntimeError("On-chain escrow refund transaction reverted.")

    event_index = 0
    try:
        events = contract.events.EscrowRefunded().process_receipt(receipt)
        if events:
            event_index = int(events[0]["logIndex"])
    except Exception:  # noqa: BLE001
        event_index = 0

    return EscrowSettlementResult(
        tx_hash=Web3.to_hex(tx_hash_bytes),
        onchain_booking_id=booking_id_hex,
        event_index=event_index,
    )


def read_escrow_record_onchain(
    *,
    chain: ChainConfig,
    reservation_id: str,
    onchain_booking_id: str | None = None,
) -> OnchainEscrowRecord:
    try:
        from web3 import Web3
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(
            "Missing web3 dependencies. Install/refresh hillside-api dependencies to read on-chain escrow."
        ) from exc

    if not chain.rpc_url:
        raise RuntimeError("Active chain RPC URL is not configured.")
    if not chain.escrow_contract_address:
        raise RuntimeError("Active chain contract address is not configured.")

    w3 = Web3(Web3.HTTPProvider(chain.rpc_url))
    if not w3.is_connected():
        raise RuntimeError(f"Unable to connect to {chain.key} RPC.")

    contract_address = Web3.to_checksum_address(chain.escrow_contract_address)
    contract = w3.eth.contract(address=contract_address, abi=ESCROW_LEDGER_ABI)

    booking_id_bytes32, booking_id_hex = _resolve_booking_id_bytes(
        Web3, reservation_id, onchain_booking_id
    )

    row = contract.functions.escrows(booking_id_bytes32).call()
    state_index = int(row[4] if len(row) > 4 else 0)
    state_map = {
        0: "none",
        1: "locked",
        2: "released",
        3: "refunded",
    }
    return OnchainEscrowRecord(
        booking_id=booking_id_hex,
        state=state_map.get(state_index, "none"),
        amount_wei=int(row[3] if len(row) > 3 else 0),
    )
