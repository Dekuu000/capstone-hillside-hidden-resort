from dataclasses import dataclass
from typing import Any

from app.core.chains import ChainConfig
from app.core.config import settings

# Minimal ABI slice for mint + verification calls.
GUEST_PASS_NFT_ABI: list[dict[str, Any]] = [
    {
        "inputs": [
            {"internalType": "address", "name": "to", "type": "address"},
            {"internalType": "bytes32", "name": "reservationHash", "type": "bytes32"},
        ],
        "name": "mintGuestPass",
        "outputs": [
            {"internalType": "uint256", "name": "tokenId", "type": "uint256"},
        ],
        "stateMutability": "nonpayable",
        "type": "function",
    },
    {
        "inputs": [
            {"internalType": "bytes32", "name": "", "type": "bytes32"},
        ],
        "name": "reservationToken",
        "outputs": [
            {"internalType": "uint256", "name": "", "type": "uint256"},
        ],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [
            {"internalType": "uint256", "name": "tokenId", "type": "uint256"},
        ],
        "name": "ownerOf",
        "outputs": [
            {"internalType": "address", "name": "", "type": "address"},
        ],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "anonymous": False,
        "inputs": [
            {"indexed": True, "internalType": "uint256", "name": "tokenId", "type": "uint256"},
            {"indexed": True, "internalType": "bytes32", "name": "reservationHash", "type": "bytes32"},
            {"indexed": True, "internalType": "address", "name": "recipient", "type": "address"},
            {"indexed": False, "internalType": "address", "name": "operator", "type": "address"},
            {"indexed": False, "internalType": "uint256", "name": "timestamp", "type": "uint256"},
        ],
        "name": "GuestPassMinted",
        "type": "event",
    },
]


@dataclass(frozen=True)
class GuestPassMintResult:
    tx_hash: str
    reservation_hash: str
    token_id: int
    recipient: str


@dataclass(frozen=True)
class GuestPassVerificationResult:
    reservation_hash: str
    token_id: int
    owner: str | None
    valid: bool


def _build_eip1559_fee_params(w3) -> dict[str, int]:
    """
    Use a conservative fee bump so Sepolia NFT mints are less likely to stall in mempool.
    """
    try:
        base_fee = int(w3.eth.gas_price)
    except Exception:  # noqa: BLE001
        base_fee = int(w3.to_wei(2, "gwei"))

    try:
        priority_fee = int(w3.eth.max_priority_fee)
    except Exception:  # noqa: BLE001
        priority_fee = int(w3.to_wei(2, "gwei"))

    min_priority_fee = int(w3.to_wei(2, "gwei"))
    priority_fee = max(priority_fee, min_priority_fee)
    max_fee_per_gas = max(base_fee * 3, base_fee + (priority_fee * 2))
    return {
        "maxFeePerGas": int(max_fee_per_gas),
        "maxPriorityFeePerGas": int(priority_fee),
    }


def _reservation_hash_hex(web3_module, reservation_id: str) -> tuple[bytes, str]:
    reservation_hash = web3_module.keccak(text=reservation_id)
    return reservation_hash, web3_module.to_hex(reservation_hash)


def mint_guest_pass_onchain(
    *,
    chain: ChainConfig,
    reservation_id: str,
) -> GuestPassMintResult:
    try:
        from eth_account import Account
        from web3 import Web3
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(
            "Missing web3 dependencies. Install/refresh hillside-api dependencies to mint NFT guest pass."
        ) from exc

    if not chain.rpc_url:
        raise RuntimeError("Active chain RPC URL is not configured.")
    if not chain.guest_pass_contract_address:
        raise RuntimeError("Active chain guest pass contract address is not configured.")
    if not chain.signer_private_key:
        raise RuntimeError("Active chain signer private key is not configured.")

    w3 = Web3(Web3.HTTPProvider(chain.rpc_url))
    if not w3.is_connected():
        raise RuntimeError(f"Unable to connect to {chain.key} RPC.")

    account = Account.from_key(chain.signer_private_key)
    recipient = Web3.to_checksum_address(account.address)
    contract_address = Web3.to_checksum_address(chain.guest_pass_contract_address)
    contract = w3.eth.contract(address=contract_address, abi=GUEST_PASS_NFT_ABI)
    reservation_hash_bytes, reservation_hash_hex = _reservation_hash_hex(Web3, reservation_id)

    nonce = w3.eth.get_transaction_count(account.address, "pending")
    fee_params = _build_eip1559_fee_params(w3)

    tx = contract.functions.mintGuestPass(recipient, reservation_hash_bytes).build_transaction(
        {
            "chainId": chain.chain_id,
            "nonce": nonce,
            "from": account.address,
            "gas": 320000,
            "maxFeePerGas": fee_params["maxFeePerGas"],
            "maxPriorityFeePerGas": fee_params["maxPriorityFeePerGas"],
        }
    )
    signed = account.sign_transaction(tx)
    tx_hash_bytes = w3.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3.eth.wait_for_transaction_receipt(
        tx_hash_bytes,
        timeout=settings.escrow_tx_receipt_timeout_sec,
    )
    if int(receipt.status or 0) != 1:
        raise RuntimeError("Guest pass mint transaction reverted.")

    token_id: int | None = None
    try:
        events = contract.events.GuestPassMinted().process_receipt(receipt)
        if events:
            token_id = int(events[0]["args"]["tokenId"])
    except Exception:  # noqa: BLE001
        token_id = None

    if token_id is None:
        token_id = int(contract.functions.reservationToken(reservation_hash_bytes).call())
    if token_id <= 0:
        raise RuntimeError("Guest pass mint transaction succeeded but token id was not resolved.")

    return GuestPassMintResult(
        tx_hash=Web3.to_hex(tx_hash_bytes),
        reservation_hash=reservation_hash_hex.lower(),
        token_id=token_id,
        recipient=recipient,
    )


def verify_guest_pass_onchain(
    *,
    chain: ChainConfig,
    reservation_id: str,
    expected_token_id: int | None = None,
) -> GuestPassVerificationResult:
    try:
        from web3 import Web3
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(
            "Missing web3 dependencies. Install/refresh hillside-api dependencies to verify NFT guest pass."
        ) from exc

    if not chain.rpc_url:
        raise RuntimeError("Active chain RPC URL is not configured.")
    if not chain.guest_pass_contract_address:
        raise RuntimeError("Active chain guest pass contract address is not configured.")

    w3 = Web3(Web3.HTTPProvider(chain.rpc_url))
    if not w3.is_connected():
        raise RuntimeError(f"Unable to connect to {chain.key} RPC.")

    contract_address = Web3.to_checksum_address(chain.guest_pass_contract_address)
    contract = w3.eth.contract(address=contract_address, abi=GUEST_PASS_NFT_ABI)
    reservation_hash_bytes, reservation_hash_hex = _reservation_hash_hex(Web3, reservation_id)

    token_id = int(contract.functions.reservationToken(reservation_hash_bytes).call())
    owner: str | None = None
    valid = token_id > 0
    if token_id > 0:
        owner = str(contract.functions.ownerOf(token_id).call())
    if expected_token_id is not None:
        valid = valid and int(expected_token_id) == token_id

    return GuestPassVerificationResult(
        reservation_hash=reservation_hash_hex.lower(),
        token_id=token_id,
        owner=owner,
        valid=valid,
    )
