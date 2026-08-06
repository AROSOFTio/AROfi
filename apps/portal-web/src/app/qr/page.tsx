import VoucherQrConnect from '../../components/VoucherQrConnect'

type VoucherQrPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

export default async function VoucherQrPage({ searchParams }: VoucherQrPageProps) {
  const params = await searchParams

  return (
    <VoucherQrConnect
      voucher={firstValue(params.voucher ?? params.code)}
      hotspotHost={firstValue(params.host)}
    />
  )
}
