import { Injectable } from '@nestjs/common'
import { randomInt } from 'crypto'

export type VoucherCodeFormat = 'NUMBERS' | 'MIXED' | 'UPPERCASE_TEXT' | 'LOWERCASE_TEXT'

@Injectable()
export class VoucherCodeService {
  private sanitize(input: string) {
    return input.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
  }

  generateBatchNumber(label = 'RND') {
    const safeLabel = this.sanitize(label) || 'RND'
    const now = new Date()
    const datePart = `${now.getUTCFullYear()}${(now.getUTCMonth() + 1).toString().padStart(2, '0')}${now
      .getUTCDate()
      .toString()
      .padStart(2, '0')}`
    const suffix = this.randomFromAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6)

    return `${safeLabel}-${datePart}-${suffix}`
  }

  generateVoucherCode(format: VoucherCodeFormat = 'MIXED', length = 10) {
    return this.randomFromAlphabet(this.getAlphabet(format), this.normalizeLength(length))
  }

  generateSerialNumber(batchNumber: string, index: number) {
    const batchSuffix = batchNumber.split('-').slice(-1)[0]
    return `SN-${batchSuffix}-${index.toString().padStart(4, '0')}`
  }

  private getAlphabet(format: VoucherCodeFormat) {
    switch (format) {
      case 'NUMBERS':
        return '23456789'
      case 'UPPERCASE_TEXT':
        return 'ABCDEFGHJKLMNPQRSTUVWXYZ'
      case 'LOWERCASE_TEXT':
        return 'abcdefghijkmnopqrstuvwxyz'
      case 'MIXED':
      default:
        return 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    }
  }

  private normalizeLength(length: number) {
    if (!Number.isFinite(length)) return 10
    return Math.min(Math.max(Math.floor(length), 6), 24)
  }

  private randomFromAlphabet(alphabet: string, length: number) {
    return Array.from({ length }, () => alphabet[randomInt(0, alphabet.length)]).join('')
  }
}
