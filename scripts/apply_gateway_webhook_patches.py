#!/usr/bin/env python3
"""Final guarded callback normalization for explicit gateway identities."""

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text()


def write(path: str, text: str) -> None:
    (ROOT / path).write_text(text)


def replace_once(path: str, old: str, new: str, sentinel: str | None = None) -> None:
    text = read(path)
    if sentinel and sentinel in text:
        return
    if new in text:
        return
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{path}: expected one match, found {count}: {old[:120]!r}')
    write(path, text.replace(old, new, 1))


def regex_once(path: str, pattern: str, replacement: str, sentinel: str | None = None) -> None:
    text = read(path)
    if sentinel and sentinel in text:
        return
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f'{path}: expected one regex match, found {count}')
    write(path, updated)


service = 'apps/api/src/modules/payments/payments.service.ts'
regex_once(
    service,
    r"  private resolveWebhookSecretEnvVar\(provider: PaymentProvider, direction: 'collection' \| 'disbursement'\) \{.*?\n  \}\n\n  // Constant-time secret comparison",
    """  private resolveWebhookSecretEnvVar(provider: PaymentProvider, direction: 'collection' | 'disbursement') {
    if (provider === PaymentProvider.IOTEC_PAY) {
      return 'IOTEC_WEBHOOK_SECRET'
    }
    if (provider === PaymentProvider.PESAPAL) {
      return 'PESAPAL_WEBHOOK_SECRET'
    }
    if (provider === PaymentProvider.YO_UGANDA || provider === PaymentProvider.AGGREGATOR) {
      return direction === 'disbursement'
        ? 'YO_UGANDA_WEBHOOK_SECRET'
        : 'YO_UGANDA_COLLECTION_WEBHOOK_SECRET'
    }
    if (provider === PaymentProvider.MTN_MOMO_DIRECT) {
      return direction === 'disbursement'
        ? 'MTN_MOMO_DISBURSEMENT_WEBHOOK_SECRET'
        : 'MTN_MOMO_COLLECTION_WEBHOOK_SECRET'
    }
    if (provider === PaymentProvider.AIRTEL_MONEY_DIRECT) {
      return direction === 'disbursement'
        ? 'AIRTEL_MONEY_DISBURSEMENT_WEBHOOK_SECRET'
        : 'AIRTEL_MONEY_COLLECTION_WEBHOOK_SECRET'
    }
    return 'AGGREGATOR_WEBHOOK_SECRET'
  }

  // Constant-time secret comparison""",
    sentinel="return 'PESAPAL_WEBHOOK_SECRET'",
)
replace_once(
    service,
    """    return this.handleProviderWebhook(
      PaymentProvider.AGGREGATOR,
      payment?.network ?? PaymentNetwork.MTN,""",
    """    return this.handleProviderWebhook(
      payment?.provider ?? PaymentProvider.YO_UGANDA,
      payment?.network ?? PaymentNetwork.UNKNOWN,""",
    sentinel="payment?.provider ?? PaymentProvider.YO_UGANDA",
)
replace_once(
    service,
    '          provider: PaymentProvider.AGGREGATOR,\n          network: PaymentNetwork.MTN,',
    '          provider: PaymentProvider.YO_UGANDA,\n          network: disbursement.network ?? PaymentNetwork.UNKNOWN,',
    sentinel='provider: PaymentProvider.YO_UGANDA,\n          network: disbursement.network',
)

controller = 'apps/api/src/modules/payments/payments.controller.ts'
replace_once(
    controller,
    """    return this.paymentsService.handleAggregatorCollectionWebhook({ ...payload, secret }, headers)
  }

  @Get('webhooks/pesapal')""",
    """    return this.paymentsService.handleProviderWebhook(
      PaymentProvider.PESAPAL,
      PaymentNetwork.UNKNOWN,
      { ...payload, secret },
      headers,
      'collection',
    )
  }

  @Get('webhooks/pesapal')""",
    sentinel='PaymentProvider.PESAPAL,\n      PaymentNetwork.UNKNOWN',
)
replace_once(
    controller,
    """    return this.paymentsService.handleAggregatorCollectionWebhook(query, headers)
  }

  @Post('webhooks/yo-uganda')""",
    """    return this.paymentsService.handleProviderWebhook(
      PaymentProvider.PESAPAL,
      PaymentNetwork.UNKNOWN,
      query,
      headers,
      'collection',
    )
  }

  @Post('webhooks/yo-uganda')""",
    sentinel="@Get('webhooks/pesapal')",
)
# The sentinel above identifies the surrounding route but does not prove the
# method body was changed, so normalize it explicitly when still legacy.
text = read(controller)
legacy_pesapal_get = """  @Get('webhooks/pesapal')
  handlePesapalReturn(
    @Query() query: Record<string, unknown>,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    return this.paymentsService.handleAggregatorCollectionWebhook(query, headers)
  }"""
new_pesapal_get = """  @Get('webhooks/pesapal')
  handlePesapalReturn(
    @Query() query: Record<string, unknown>,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    return this.paymentsService.handleProviderWebhook(
      PaymentProvider.PESAPAL,
      PaymentNetwork.UNKNOWN,
      query,
      headers,
      'collection',
    )
  }"""
if legacy_pesapal_get in text:
    text = text.replace(legacy_pesapal_get, new_pesapal_get, 1)
write(controller, text)

text = read(controller)
legacy_yo_post = """  @Post('webhooks/yo-uganda')
  handleYoUgandaWebhook(
    @Body() payload: Record<string, unknown>,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Query('secret') secret?: string,
  ) {
    return this.paymentsService.handleAggregatorCollectionWebhook({ ...payload, secret }, headers)
  }"""
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
legacy_yo_get = """  @Get('webhooks/yo-uganda')
  handleYoUgandaReturn(
    @Query() query: Record<string, unknown>,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    return this.paymentsService.handleAggregatorCollectionWebhook(query, headers)
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
if legacy_yo_post in text:
    text = text.replace(legacy_yo_post, new_yo_post, 1)
if legacy_yo_get in text:
    text = text.replace(legacy_yo_get, new_yo_get, 1)
write(controller, text)

for env_path in ['.env.example', '.env.vps.example']:
    text = read(env_path)
    additions = []
    if 'YO_UGANDA_COLLECTION_WEBHOOK_SECRET=' not in text:
        additions.append('YO_UGANDA_COLLECTION_WEBHOOK_SECRET=replace_with_long_random_secret')
    if 'PESAPAL_WEBHOOK_SECRET=' not in text:
        additions.append('PESAPAL_WEBHOOK_SECRET=replace_with_long_random_secret')
    if additions:
        text = text.rstrip() + '\n' + '\n'.join(additions) + '\n'
    write(env_path, text)

print('Provider-specific webhook patches applied.')
