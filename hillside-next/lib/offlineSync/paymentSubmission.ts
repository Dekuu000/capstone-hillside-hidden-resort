import type { UploadQueueItem } from "../../../packages/shared/src/types";
import { enqueueOfflineOperation } from "./engine";
import { queueUploadItem, saveUploadBlob } from "./store";

type QueuePaymentSubmissionWithFileParams = {
  userId: string;
  reservationId: string;
  amount: number;
  paymentType: string;
  method: string;
  referenceNo?: string | null;
  file: File;
  action?: string;
};

function getFileExtension(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase().trim() || "bin";
  if (!/^[a-z0-9]+$/.test(ext)) return "bin";
  return ext;
}

export async function queuePaymentSubmissionWithFile(
  params: QueuePaymentSubmissionWithFileParams,
): Promise<{ operationId: string; uploadId: string; idempotencyKey: string }> {
  const uploadId = crypto.randomUUID();
  const extension = getFileExtension(params.file.name);
  const storagePath = `payments/${params.userId}/${params.reservationId}-${uploadId}.${extension}`;
  const idempotencyKey = crypto.randomUUID();

  const operation = await enqueueOfflineOperation({
    idempotency_key: idempotencyKey,
    entity_type: "payment_submission",
    action: params.action || "payments.submissions.create",
    entity_id: params.reservationId,
    payload: {
      reservation_id: params.reservationId,
      amount: params.amount,
      payment_type: params.paymentType,
      method: params.method,
      reference_no: params.referenceNo?.trim() || null,
      proof_url: null,
      proof_upload_id: uploadId,
      idempotency_key: idempotencyKey,
    },
  });

  const uploadItem: UploadQueueItem = {
    upload_id: uploadId,
    operation_id: operation.operation_id,
    entity_type: "payment_submission",
    entity_id: params.reservationId,
    field_name: "proof_url",
    storage_bucket: "payment-proofs",
    storage_path: storagePath,
    mime_type: params.file.type || null,
    size_bytes: params.file.size,
    checksum_sha256: null,
    status: "queued",
    failure_reason: null,
    metadata: {
      file_name: params.file.name,
    },
  };

  await queueUploadItem(uploadItem);
  await saveUploadBlob(uploadId, params.file, params.file.name);

  return {
    operationId: operation.operation_id,
    uploadId,
    idempotencyKey,
  };
}
