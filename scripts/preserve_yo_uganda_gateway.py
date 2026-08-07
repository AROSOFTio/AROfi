#!/usr/bin/env python3
"""Preserve the existing working Yo! Uganda implementation.

The universal gateway selector may choose Yo! Uganda or ioTec Pay, but this
final build patch deliberately leaves Yo!'s collection/disbursement adapters,
legacy AGGREGATOR transaction identity, and existing callback handlers intact.
Only ioTec receives the new live-wallet and callback-readiness requirements.
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text()


def write(path: str, text: str) -> None:
    (ROOT / path).write_text(text)


def replace_all(path: str, old: str, new: str) -> None:
    text = read(path)
    if old in text:
        text = text.replace(old, new)
    write(path, text)


# Keep the provider identity used by the currently working Yo! Uganda flow.
for service in [
    'apps/api/src/modules/payments/yo-uganda-collection.service.ts',
    'apps/api/src/modules/payments/yo-uganda-disbursement.service.ts',
]:
    replace_all(
        service,
        'readonly provider = PaymentProvider.YO_UGANDA',
        'readonly provider = PaymentProvider.AGGREGATOR',
    )

# Keep the existing Yo! collection callback handlers. ioTec keeps its own new
# provider-specific callback route; this does not touch it.
controller = 'apps/api/src/modules/payments/payments.controller.ts'
text = read(controller)
new_yo_post = """  @Post('webhooks/yo-uganda')
  handleYoUgandaWebhook(
    @Body() payload: Record<string, unknown>,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Query('secret') secret?: string,
  ) {
    return this.paymentsService.handleProviderWebhook(
      PaymentProvider.YO_UGANDA,
      PaymentNetwork.UNKNOWN,
      { ...payload, secret },
      headers,
      'collection',
    )
  }"""
legacy_yo_post = """  @Post('webhooks/yo-uganda')
  handleYoUgandaWebhook(
    @Body() payload: Record<string, unknown>,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Query('secret') secret?: string,
  ) {
    return this.paymentsService.handleAggregatorCollectionWebhook({ ...payload, secret }, headers)
  }"""
new_yo_get = """  @Get('webhooks/yo-uganda')
  handleYoUgandaReturn(
    @Query() query: Record<string, unknown>,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    return this.paymentsService.handleProviderWebhook(
      PaymentProvider.YO_UGANDA,
      PaymentNetwork.UNKNOWN,
      query,
      headers,
      'collection',
    )
  }"""
legacy_yo_get = """  @Get('webhooks/yo-uganda')
  handleYoUgandaReturn(
    @Query() query: Record<string, unknown>,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    return this.paymentsService.handleAggregatorCollectionWebhook(query, headers)
  }"""
if new_yo_post in text:
    text = text.replace(new_yo_post, legacy_yo_post, 1)
if new_yo_get in text:
    text = text.replace(new_yo_get, legacy_yo_get, 1)
if legacy_yo_post not in text or legacy_yo_get not in text:
    raise RuntimeError('The existing Yo! Uganda callback handlers were not preserved')
write(controller, text)

# Preserve the existing generic aggregator identity for Yo! callbacks and old
# transactions. These replacements are narrowly scoped to code introduced by
# the gateway-normalization patch.
payments = 'apps/api/src/modules/payments/payments.service.ts'
replace_all(
    payments,
    'payment?.provider ?? PaymentProvider.YO_UGANDA,\n      payment?.network ?? PaymentNetwork.UNKNOWN,',
    'payment?.provider ?? PaymentProvider.AGGREGATOR,\n      payment?.network ?? PaymentNetwork.MTN,',
)
replace_all(
    payments,
    'provider: PaymentProvider.YO_UGANDA,\n          network: PaymentNetwork.UNKNOWN,',
    'provider: PaymentProvider.AGGREGATOR,\n          network: PaymentNetwork.MTN,',
)

# Do not introduce any new Yo!-specific environment/callback requirement.
# Existing credentials and existing callback configuration remain sufficient.
router = 'apps/api/src/modules/payments/payment-router.service.ts'
text = read(router)
new_yo_readiness = """      YO_UGANDA: {
        label: 'Yo! Uganda',
        configured: missing(['YO_UGANDA_USERNAME', 'YO_UGANDA_PASSWORD']).length === 0,
        webhookConfigured:
          configuredValue('YO_UGANDA_COLLECTION_WEBHOOK_SECRET') &&
          configuredValue('YO_UGANDA_WEBHOOK_SECRET'),
        liveWalletConfigured: true,
        missingConfiguration: missing([
          'YO_UGANDA_USERNAME',
          'YO_UGANDA_PASSWORD',
          'YO_UGANDA_COLLECTION_WEBHOOK_SECRET',
          'YO_UGANDA_WEBHOOK_SECRET',
        ]),
        collectionCallbackUrl: `${appBaseUrl}/api/payments/webhooks/yo-uganda`,
        disbursementCallbackUrl: `${appBaseUrl}/api/payments/webhooks/yo-uganda/disbursement`,
      },"""
preserved_yo_readiness = """      YO_UGANDA: {
        label: 'Yo! Uganda',
        configured: missing(['YO_UGANDA_USERNAME', 'YO_UGANDA_PASSWORD']).length === 0,
        webhookConfigured: true,
        liveWalletConfigured: true,
        missingConfiguration: missing(['YO_UGANDA_USERNAME', 'YO_UGANDA_PASSWORD']),
        collectionCallbackUrl: '',
        disbursementCallbackUrl: '',
      },"""
if new_yo_readiness in text:
    text = text.replace(new_yo_readiness, preserved_yo_readiness, 1)
elif preserved_yo_readiness not in text:
    raise RuntimeError('Yo! Uganda readiness block was not found')
write(router, text)

# The selector remains, but callback instructions and the live-wallet test are
# shown only for ioTec. Yo! Uganda is simply the unchanged alternative button.
settings = 'apps/admin-web/src/components/SettingsManager.tsx'
text = read(settings)
text = text.replace(
    "{platformForm.gatewayReadiness?.providers[selectedGateway] ? (",
    "{selectedGateway === 'IOTEC_PAY' && platformForm.gatewayReadiness?.providers.IOTEC_PAY ? (",
    1,
)
old_status = """                              {readiness?.configured && readiness?.webhookConfigured
                                ? 'Ready for production testing'
                                : `Setup required${readiness?.missingConfiguration?.length ? `: ${readiness.missingConfiguration.join(', ')}` : ''}`}"""
new_status = """                              {gateway === 'YO_UGANDA'
                                ? 'Current working gateway (unchanged)'
                                : readiness?.configured && readiness?.webhookConfigured
                                  ? 'Ready for production testing'
                                  : `Setup required${readiness?.missingConfiguration?.length ? `: ${readiness.missingConfiguration.join(', ')}` : ''}`}"""
if old_status in text:
    text = text.replace(old_status, new_status, 1)
elif new_status not in text:
    raise RuntimeError('Gateway status label was not found')
write(settings, text)

print('Yo! Uganda implementation preserved; only selector availability changed.')
