export function shortHash(value: string, head = 10, tail = 8) {
  if (value.length <= head + tail + 3) return value;
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

function ensure0xPrefix(txHash: string) {
  return txHash.startsWith("0x") ? txHash : `0x${txHash}`;
}

export function normalizeTxHash(value: string | null | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const exact = raw.match(/^0x[a-fA-F0-9]{64}$/);
  if (exact) return exact[0];
  const embedded = raw.match(/0x[a-fA-F0-9]{64}/);
  return embedded?.[0] ?? raw;
}

export function buildTxExplorerUrlFromBase(explorerBaseUrl: string | null | undefined, txHash: string | null | undefined) {
  const normalizedHash = normalizeTxHash(txHash);
  if (!normalizedHash) return null;
  const base = String(explorerBaseUrl || "").trim().replace(/\/+$/, "");
  if (!base) return null;
  const txIndex = base.indexOf("/tx/");
  if (txIndex >= 0) {
    return `${base.slice(0, txIndex)}/tx/${normalizedHash}`;
  }
  if (base.endsWith("/tx")) {
    return `${base}/${normalizedHash}`;
  }
  return `${base}/tx/${normalizedHash}`;
}

export function buildTxExplorerUrl(chainKey: string | null | undefined, txHash: string | null | undefined) {
  if (!txHash) return null;
  const normalized = ensure0xPrefix(txHash);
  if ((chainKey || "").toLowerCase() === "amoy") return `https://amoy.polygonscan.com/tx/${normalized}`;
  return `https://sepolia.etherscan.io/tx/${normalized}`;
}

export function buildTokenExplorerUrl(
  chainKey: string | null | undefined,
  contractAddress: string | null | undefined,
  tokenId: number | null | undefined,
) {
  if (!contractAddress || tokenId == null) return null;
  if ((chainKey || "").toLowerCase() === "amoy") {
    return `https://amoy.polygonscan.com/token/${contractAddress}?a=${tokenId}`;
  }
  return `https://sepolia.etherscan.io/token/${contractAddress}?a=${tokenId}`;
}
