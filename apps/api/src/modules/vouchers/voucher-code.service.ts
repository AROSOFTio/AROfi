import { Injectable } from '@nestjs/common'

@Injectable()
export class VoucherCodeService {
  private sanitize(input: string) {
    return input.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
  }

  generateBatchNumber(prefix: string) {
    const safePrefix = this.sanitize(prefix)
    const now = new Date()
    const datePart = `${now.getUTCFullYear()}${(now.getUTCMonth() + 1).toString().padStart(2, '0')}${now
      .getUTCDate()
      .toString()
      .padStart(2, '0')}`
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase()

    return `${safePrefix}-${datePart}-${suffix}`
  }

  generateVoucherCode(prefix: string, batchNumber: string, index: number) {
    const safePrefix = this.sanitize(prefix)
    const batchSuffix = batchNumber.split('-').slice(-1)[0]
    return `${safePrefix}-${batchSuffix}-${index.toString().padStart(4, '0')}`
  }

  generateSerialNumber(batchNumber: string, index: number) {
    const batchSuffix = batchNumber.split('-').slice(-1)[0]
    return `SN-${batchSuffix}-${index.toString().padStart(4, '0')}`
  }
}
