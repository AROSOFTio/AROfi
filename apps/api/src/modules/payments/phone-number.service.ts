import { BadRequestException, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PaymentNetwork } from '@prisma/client'

const NETWORK_ERROR =
  'This number does not match the selected network. Please choose the correct network or enter the correct phone number.'

@Injectable()
export class PhoneNumberService {
  constructor(private readonly configService: ConfigService) {}

  normalize(phoneNumber: string) {
    const digits = phoneNumber.replace(/\D/g, '')

    if (/^256\d{9}$/.test(digits)) {
      return digits
    }

    if (/^0\d{9}$/.test(digits)) {
      return `256${digits.slice(1)}`
    }

    if (/^[37]\d{8}$/.test(digits)) {
      return `256${digits}`
    }

    throw new BadRequestException('Phone number must be a valid Uganda phone number')
  }

  normalizeForNetwork(phoneNumber: string, network: PaymentNetwork) {
    const normalized = this.normalize(phoneNumber)
    const localPrefix = `0${normalized.slice(3, 5)}`
    const allowed = this.getAllowedPrefixes(network)

    if (!allowed.includes(localPrefix)) {
      throw new BadRequestException(NETWORK_ERROR)
    }

    return normalized
  }

  getAllowedPrefixes(network: PaymentNetwork) {
    const key = network === PaymentNetwork.AIRTEL ? 'AIRTEL_ALLOWED_PREFIXES' : 'MTN_ALLOWED_PREFIXES'
    const fallback = network === PaymentNetwork.AIRTEL ? '070,075,074' : '077,078,076,079,031,039'
    return (this.configService.get<string>(key) ?? fallback)
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }
}
