import 'reflect-metadata'
import { validate } from 'class-validator'
import { AgentCashSaleDto, AgentMobileMoneySaleDto } from './dto/agent-sales.dto'

describe('Agent sales DTO', () => {
  const packageId = 'b6a8c2d7-5f45-4cd4-b1f5-20726efcf3be'

  it('allows a cash voucher-code sale without a customer phone number', async () => {
    const dto = Object.assign(new AgentCashSaleDto(), {
      packageId,
      fulfillment: 'VOUCHER_LATER',
    })

    const errors = await validate(dto)
    expect(errors).toEqual([])
  })

  it('still requires the paying phone for Mobile Money but not a separate customer phone', async () => {
    const dto = Object.assign(new AgentMobileMoneySaleDto(), {
      packageId,
      fulfillment: 'VOUCHER_LATER',
      payingPhoneNumber: '0772123456',
      network: 'MTN',
    })

    const errors = await validate(dto)
    expect(errors).toEqual([])
  })
})
