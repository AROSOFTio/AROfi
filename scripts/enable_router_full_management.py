#!/usr/bin/env python3
"""Enable complete router editing and audit-safe deletion.

This repo deliberately applies several source normalizers during the Docker build.
Keep router management in the same deterministic pipeline so older generated UI
or lifecycle guards cannot silently remove these controls.
"""

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
DTO = ROOT / 'apps/api/src/modules/routers/dto/update-router.dto.ts'
CONTROLLER = ROOT / 'apps/api/src/modules/routers/routers.controller.ts'
LIFECYCLE = ROOT / 'apps/api/src/modules/routers/router-lifecycle.service.ts'
ROUTERS_SERVICE = ROOT / 'apps/api/src/modules/routers/routers.service.ts'
OVERVIEW = ROOT / 'apps/api/src/modules/routers/router-overview.service.ts'
CLIENT_API = ROOT / 'apps/admin-web/src/lib/client-api.ts'
PAGE = ROOT / 'apps/admin-web/src/app/(dashboard)/admin/settings/routers/page.tsx'
COMPONENT = ROOT / 'apps/admin-web/src/components/RouterFullEditModal.tsx'

DELETED_TAG = 'AROFI_DELETED'


def require(path: Path) -> str:
    if not path.exists():
        raise RuntimeError(f'Required router-management file missing: {path.relative_to(ROOT)}')
    return path.read_text(encoding='utf-8')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected one source anchor, found {count}')
    return text.replace(old, new, 1)


def write_update_dto() -> None:
    DTO.write_text(
        """import { RouterConnectionMode, RouterScriptMode } from '@prisma/client'\n"
        "import {\n"
        "  ArrayMaxSize,\n"
        "  IsArray,\n"
        "  IsBoolean,\n"
        "  IsEnum,\n"
        "  IsInt,\n"
        "  IsNotEmpty,\n"
        "  IsOptional,\n"
        "  IsString,\n"
        "  IsUUID,\n"
        "  Max,\n"
        "  Min,\n"
        "} from 'class-validator'\n\n"
        "export class UpdateRouterDto {\n"
        "  @IsOptional()\n  @IsUUID()\n  groupId?: string | null\n\n"
        "  @IsOptional()\n  @IsUUID()\n  hotspotId?: string | null\n\n"
        "  @IsOptional()\n  @IsString()\n  @IsNotEmpty()\n  name?: string\n\n"
        "  @IsOptional()\n  @IsString()\n  identity?: string | null\n\n"
        "  @IsOptional()\n  @IsString()\n  host?: string\n\n"
        "  @IsOptional()\n  @IsInt()\n  @Min(1)\n  @Max(65535)\n  apiPort?: number\n\n"
        "  @IsOptional()\n  @IsEnum(RouterConnectionMode)\n  connectionMode?: RouterConnectionMode\n\n"
        "  @IsOptional()\n  @IsString()\n  username?: string\n\n"
        "  @IsOptional()\n  @IsString()\n  password?: string\n\n"
        "  @IsOptional()\n  @IsString()\n  siteLabel?: string | null\n\n"
        "  @IsOptional()\n  @IsString()\n  locationText?: string | null\n\n"
        "  @IsOptional()\n  @IsString()\n  ispName?: string | null\n\n"
        "  @IsOptional()\n  @IsString()\n  managerName?: string | null\n\n"
        "  @IsOptional()\n  @IsString()\n  managerPhone?: string | null\n\n"
        "  @IsOptional()\n  @IsString()\n  model?: string | null\n\n"
        "  @IsOptional()\n  @IsString()\n  serialNumber?: string | null\n\n"
        "  @IsOptional()\n  @IsString()\n  routerOsVersion?: string | null\n\n"
        "  @IsOptional()\n  @IsString()\n  radiusNasIpAddress?: string | null\n\n"
        "  @IsOptional()\n  @IsString()\n  hotspotServerName?: string | null\n\n"
        "  @IsOptional()\n  @IsArray()\n  @ArrayMaxSize(12)\n  @IsString({ each: true })\n  portalWalledGardenHosts?: string[]\n\n"
        "  @IsOptional()\n  @IsBoolean()\n  ttlAntiTetheringEnabled?: boolean\n\n"
        "  @IsOptional()\n  @IsEnum(RouterScriptMode)\n  scriptMode?: RouterScriptMode\n"
        "}\n""",
        encoding='utf-8',
    )


def patch_controller() -> None:
    text = require(CONTROLLER)
    old = """  @Delete(':routerId')
  deleteRouter(@CurrentUser() user: AuthenticatedAdminUser, @Param('routerId') routerId: string) {
    const tenantId = this.accessScope.resolveTenantScope(user)
    return this.routerLifecycleService.deleteRouter(routerId, tenantId ?? undefined)
  }
"""
    new = """  @Delete(':routerId')
  deleteRouter(
    @CurrentUser() user: AuthenticatedAdminUser,
    @Param('routerId') routerId: string,
    @Body() body: { reason?: string },
  ) {
    const tenantId = this.accessScope.resolveTenantScope(user)
    return this.routerLifecycleService.deleteRouter(routerId, body.reason ?? '', tenantId ?? undefined)
  }
"""
    CONTROLLER.write_text(replace_once(text, old, new, 'router delete controller'), encoding='utf-8')


def patch_lifecycle() -> None:
    text = require(LIFECYCLE)
    if "const DELETED_TAG = 'AROFI_DELETED'" not in text:
        text = replace_once(
            text,
            "const DEACTIVATED_TAG = 'AROFI_DEACTIVATED'\n",
            "const DEACTIVATED_TAG = 'AROFI_DEACTIVATED'\nconst DELETED_TAG = 'AROFI_DELETED'\n",
            'deleted lifecycle tag',
        )

    text = text.replace(
        "      canDelete: protectedActivityCount === 0,",
        "      canDelete: true,\n      deletionMode: protectedActivityCount > 0 ? ('ARCHIVE_HISTORY' as const) : ('PERMANENT' as const),",
        1,
    )
    old_reason = """      deleteBlockReason:
        protectedActivityCount > 0
          ? 'This router has customer, access, or transaction-linked history. Deactivate it instead so AROFi keeps the audit trail.'
          : null,
"""
    new_reason = """      deleteBlockReason: null,
      deleteNotice:
        protectedActivityCount > 0
          ? 'Deleting removes this router from active management while preserving its customer, session and transaction history.'
          : 'This router has no protected history and can be permanently removed.',
"""
    if old_reason in text:
        text = text.replace(old_reason, new_reason, 1)

    method = r'''  async deleteRouter(routerId: string, reason: string, tenantId?: string) {
    const normalizedReason = reason?.trim()
    if (!normalizedReason || normalizedReason.length < 3) {
      throw new BadRequestException('A deletion reason of at least 3 characters is required')
    }

    const router = await this.findRouter(routerId, tenantId)
    let archivedHistory = false
    let protectedActivityCount = 0
    let protectedActivity: Record<string, number> = {}

    await this.prisma.$transaction(
      async (tx) => {
        const lockedRouter = await tx.router.findFirst({
          where: tenantId ? { id: router.id, tenantId } : { id: router.id },
          select: { id: true, tenantId: true, name: true, tags: true },
        })
        if (!lockedRouter) {
          throw new NotFoundException('Router not found')
        }

        const [activations, sessions, voucherRedemptions, compensations, radiusCredentials, disconnectionAttempts] =
          await Promise.all([
            tx.packageActivation.count({ where: { routerId: router.id } }),
            tx.networkSession.count({ where: { routerId: router.id } }),
            tx.voucherRedemption.count({ where: { routerId: router.id } }),
            tx.routerCompensation.count({ where: { routerId: router.id } }),
            tx.radiusCredential.count({ where: { routerId: router.id } }),
            tx.disconnectionAttempt.count({ where: { routerId: router.id } }),
          ])

        protectedActivity = {
          activations,
          sessions,
          voucherRedemptions,
          compensations,
          radiusCredentials,
          disconnectionAttempts,
        }
        protectedActivityCount = Object.values(protectedActivity).reduce((sum, count) => sum + count, 0)

        if (protectedActivityCount > 0) {
          archivedHistory = true
          const tags = Array.from(new Set([...lockedRouter.tags, DEACTIVATED_TAG, DELETED_TAG]))
          await tx.router.update({
            where: { id: router.id },
            data: {
              tags,
              status: RouterStatus.OFFLINE,
              isRemotePortOpen: false,
              remoteAccessEnabled: false,
              healthMessage: `Deleted from active AROFi management. Reason: ${normalizedReason}`,
            },
          })
          await tx.radiusClient.updateMany({
            where: { routerId: router.id },
            data: { status: RadiusClientStatus.DISABLED },
          })
          await tx.nasClient.updateMany({
            where: { routerId: router.id },
            data: { enabled: false },
          })
        } else {
          await tx.radiusEvent.deleteMany({ where: { routerId: router.id } })
          await tx.routerHealthCheck.deleteMany({ where: { routerId: router.id } })
          await tx.routerOutage.deleteMany({ where: { routerId: router.id } })
          await tx.radiusClient.deleteMany({ where: { routerId: router.id } })
          await tx.nasClient.deleteMany({ where: { routerId: router.id } })

          const remoteUsername = `router-${router.id}`
          await tx.radCheck.deleteMany({ where: { username: remoteUsername } })
          await tx.radReply.deleteMany({ where: { username: remoteUsername } })
        }

        await tx.auditLog.create({
          data: {
            tenantId: lockedRouter.tenantId,
            action: 'router.deleted',
            entity: 'Router',
            entityId: lockedRouter.id,
            severity: 'WARNING',
            details: {
              routerName: lockedRouter.name,
              reason: normalizedReason,
              deletionMode: archivedHistory ? 'ARCHIVE_HISTORY' : 'PERMANENT',
              protectedActivity,
            } as Prisma.InputJsonValue,
          },
        })

        if (!archivedHistory) {
          await tx.router.delete({ where: { id: router.id } })
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    )

    if (router.remotePort) {
      this.remoteProxyService.stopProxy(router.remotePort)
    }

    return {
      deleted: true,
      archivedHistory,
      routerId: router.id,
      protectedActivityCount,
      protectedActivity,
      reason: normalizedReason,
      message: archivedHistory
        ? 'Router deleted from active management. Historical transactions, sessions and customer records were preserved for reports and audit.'
        : 'Router permanently deleted. It had no protected customer or transaction history.',
    }
  }
'''
    pattern = re.compile(r"  async deleteRouter\(routerId: string, tenantId\?: string\) \{.*?\n  \}\n(?=\n  async deactivateRouter)", re.S)
    text, count = pattern.subn(method.rstrip('\n'), text, count=1)
    if count != 1 and 'async deleteRouter(routerId: string, reason: string' not in text:
        raise RuntimeError(f'router lifecycle delete method: expected one match, found {count}')

    LIFECYCLE.write_text(text, encoding='utf-8')


def patch_routers_service() -> None:
    text = require(ROUTERS_SERVICE)

    text = text.replace(
        "this.prisma.router.count({ where: { tenantId } }),",
        "this.prisma.router.count({ where: { tenantId, NOT: { tags: { has: 'AROFI_DELETED' } } } }),",
        1,
    )
    text = text.replace(
        "where: { status: { not: RouterStatus.PENDING } },",
        "where: { status: { not: RouterStatus.PENDING }, NOT: { tags: { has: 'AROFI_DELETED' } } },",
        1,
    )

    method = r'''  async updateRouter(routerId: string, dto: UpdateRouterDto, tenantId?: string) {
    const existing = await this.prisma.router.findFirst({
      where: tenantId ? { id: routerId, tenantId } : { id: routerId },
      select: { id: true, tenantId: true, tags: true },
    })
    if (!existing) {
      throw new NotFoundException('Router not found')
    }
    if (existing.tags.includes('AROFI_DELETED')) {
      throw new BadRequestException('Deleted routers cannot be edited')
    }

    if (dto.name !== undefined && !dto.name.trim()) {
      throw new BadRequestException('Router name cannot be empty')
    }
    if (dto.host !== undefined && !dto.host.trim()) {
      throw new BadRequestException('Router host cannot be empty')
    }
    if (dto.username !== undefined && !dto.username.trim()) {
      throw new BadRequestException('RouterOS API username cannot be empty')
    }

    if (dto.groupId) {
      const group = await this.prisma.routerGroup.findFirst({
        where: { id: dto.groupId, tenantId: existing.tenantId },
        select: { id: true },
      })
      if (!group) throw new BadRequestException('Router group does not belong to this business')
    }
    if (dto.hotspotId) {
      const hotspot = await this.prisma.hotspot.findFirst({
        where: { id: dto.hotspotId, tenantId: existing.tenantId },
        select: { id: true },
      })
      if (!hotspot) throw new BadRequestException('Hotspot does not belong to this business')
    }

    const provisioningChanged = [
      dto.siteLabel,
      dto.host,
      dto.apiPort,
      dto.connectionMode,
      dto.username,
      dto.password,
      dto.radiusNasIpAddress,
      dto.hotspotServerName,
      dto.portalWalledGardenHosts,
      dto.ttlAntiTetheringEnabled,
      dto.scriptMode,
    ].some((value) => value !== undefined)

    await this.prisma.$transaction(async (tx) => {
      await tx.router.update({
        where: { id: routerId },
        data: {
          ...(dto.groupId !== undefined ? { groupId: dto.groupId || null } : {}),
          ...(dto.hotspotId !== undefined ? { hotspotId: dto.hotspotId || null } : {}),
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.identity !== undefined ? { identity: dto.identity?.trim() || null } : {}),
          ...(dto.host !== undefined ? { host: dto.host.trim() } : {}),
          ...(dto.apiPort !== undefined ? { apiPort: dto.apiPort } : {}),
          ...(dto.connectionMode !== undefined ? { connectionMode: dto.connectionMode } : {}),
          ...(dto.username !== undefined ? { username: dto.username.trim() } : {}),
          ...(dto.password !== undefined && dto.password.length > 0
            ? { passwordCiphertext: this.routerCredentialsService.encrypt(dto.password) }
            : {}),
          ...(dto.siteLabel !== undefined ? { siteLabel: dto.siteLabel?.trim() || null } : {}),
          ...(dto.locationText !== undefined ? { locationText: dto.locationText?.trim() || null } : {}),
          ...(dto.ispName !== undefined ? { ispName: dto.ispName?.trim() || null } : {}),
          ...(dto.managerName !== undefined ? { managerName: dto.managerName?.trim() || null } : {}),
          ...(dto.managerPhone !== undefined ? { managerPhone: dto.managerPhone?.trim() || null } : {}),
          ...(dto.model !== undefined ? { model: dto.model?.trim() || null } : {}),
          ...(dto.serialNumber !== undefined ? { serialNumber: dto.serialNumber?.trim() || null } : {}),
          ...(dto.routerOsVersion !== undefined ? { routerOsVersion: dto.routerOsVersion?.trim() || null } : {}),
          ...(dto.radiusNasIpAddress !== undefined
            ? { radiusNasIpAddress: dto.radiusNasIpAddress?.trim() || null }
            : {}),
          ...(dto.hotspotServerName !== undefined
            ? { hotspotServerName: dto.hotspotServerName?.trim() || null }
            : {}),
          ...(dto.portalWalledGardenHosts !== undefined
            ? { portalWalledGardenHosts: dto.portalWalledGardenHosts.map((host) => host.trim()).filter(Boolean).slice(0, 12) }
            : {}),
          ...(dto.ttlAntiTetheringEnabled !== undefined
            ? { ttlAntiTetheringEnabled: dto.ttlAntiTetheringEnabled }
            : {}),
          ...(dto.scriptMode !== undefined ? { lastScriptMode: dto.scriptMode } : {}),
          ...(provisioningChanged ? { scriptGeneratedAt: new Date() } : {}),
        } as Parameters<typeof tx.router.update>[0]['data'],
      })

      if (dto.radiusNasIpAddress !== undefined) {
        const routerForNas = await tx.router.findUnique({
          where: { id: routerId },
          select: {
            id: true,
            tenantId: true,
            name: true,
            host: true,
            radiusNasIpAddress: true,
            sharedSecretCiphertext: true,
            radiusClient: { select: { id: true, shortName: true, secretCiphertext: true } },
            nasClient: { select: { id: true, shortname: true } },
          },
        })
        if (routerForNas) {
          const nasIpAddress = routerForNas.radiusNasIpAddress || routerForNas.host
          await this.upsertRadiusClientForProvisionedRouter(tx, routerForNas, nasIpAddress)
          await this.upsertNasClientForProvisionedRouter(tx, routerForNas, nasIpAddress)
        }
      }
    })

    const refreshed = await this.prisma.router.findUnique({
      where: { id: routerId },
      include: this.routerInclude,
    })
    if (!refreshed) throw new NotFoundException('Router not found')
    return this.mapRouter(refreshed)
  }
'''
    pattern = re.compile(r"  async updateRouter\(routerId: string, dto: UpdateRouterDto, tenantId\?: string\) \{.*?\n  \}\n(?=\n  (?:async|private|public|protected) )", re.S)
    text, count = pattern.subn(method.rstrip('\n'), text, count=1)
    if count != 1 and 'Deleted routers cannot be edited' not in text:
        raise RuntimeError(f'router update method: expected one match, found {count}')

    ROUTERS_SERVICE.write_text(text, encoding='utf-8')


def patch_overview() -> None:
    text = require(OVERVIEW)
    text = replace_once(
        text,
        "        this.prisma.router.findMany({\n          where: tenantWhere,",
        "        this.prisma.router.findMany({\n          where: { ...(tenantId ? { tenantId } : {}), NOT: { tags: { has: 'AROFI_DELETED' } } },",
        'hide deleted routers from overview',
    )

    text = replace_once(
        text,
        "            groupId: true,\n            name: true,",
        "            groupId: true,\n            hotspotId: true,\n            name: true,",
        'overview hotspot id',
    )
    text = replace_once(
        text,
        "            connectionMode: true,\n            siteLabel: true,",
        "            connectionMode: true,\n            username: true,\n            radiusNasIpAddress: true,\n            lastScriptMode: true,\n            siteLabel: true,",
        'overview editable technical fields',
    )
    text = replace_once(
        text,
        "      connectionMode: router.connectionMode,\n      siteLabel: router.siteLabel,",
        "      connectionMode: router.connectionMode,\n      username: router.username,\n      radiusNasIpAddress: router.radiusNasIpAddress,\n      lastScriptMode: router.lastScriptMode,\n      groupId: router.groupId,\n      hotspotId: router.hotspotId,\n      siteLabel: router.siteLabel,",
        'mapped editable technical fields',
    )
    text = text.replace("      ttlAntiTetheringEnabled: true,", "      ttlAntiTetheringEnabled: router.ttlAntiTetheringEnabled,", 1)
    OVERVIEW.write_text(text, encoding='utf-8')


def patch_client_api() -> None:
    text = require(CLIENT_API)
    old = """export async function clientDeleteApi<T>(path: string): Promise<T> {
  const doFetch = () =>
    fetch(`${browserApiBase}${path}`, {
      method: 'DELETE',
      credentials: 'include',
    })
  return parseResponse<T>(await doFetch(), doFetch)
}
"""
    new = """export async function clientDeleteApi<T>(path: string, payload?: unknown): Promise<T> {
  const doFetch = () =>
    fetch(`${browserApiBase}${path}`, {
      method: 'DELETE',
      credentials: 'include',
      ...(payload !== undefined
        ? {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }
        : {}),
    })
  return parseResponse<T>(await doFetch(), doFetch)
}
"""
    CLIENT_API.write_text(replace_once(text, old, new, 'DELETE request body support'), encoding='utf-8')


def patch_settings_page() -> None:
    text = require(PAGE)
    if "RouterFullEditModal" not in text:
        text = replace_once(
            text,
            "import { PhoneNumberField } from '@/components/PhoneNumberField'\n",
            "import { PhoneNumberField } from '@/components/PhoneNumberField'\nimport RouterFullEditModal from '@/components/RouterFullEditModal'\n",
            'edit modal import',
        )

    if 'const [editModalOpen' not in text:
        text = replace_once(
            text,
            "  const [configModalOpen, setConfigModalOpen] = useState<any | null>(null)\n",
            "  const [configModalOpen, setConfigModalOpen] = useState<any | null>(null)\n  const [editModalOpen, setEditModalOpen] = useState<any | null>(null)\n",
            'edit modal state',
        )
    if 'const [deleteReason' not in text:
        text = replace_once(
            text,
            "  const [deleteError, setDeleteError] = useState('')\n",
            "  const [deleteError, setDeleteError] = useState('')\n  const [deleteReason, setDeleteReason] = useState('')\n",
            'delete reason state',
        )

    old_delete_handler = """  // Action: Delete router
  const handleDeleteRouter = async () => {
    if (!deleteModalRouter) return
    setDeleteError('')
    setDeleting(true)
    try {
      await clientDeleteApi(`/routers/${deleteModalRouter.id}`)
      setDeleteModalRouter(null)
      await loadData()
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }
"""
    new_delete_handler = """  // Action: Delete router. Historical business records are archived, never destroyed.
  const handleDeleteRouter = async () => {
    if (!deleteModalRouter) return
    const reason = deleteReason.trim()
    if (reason.length < 3) {
      setDeleteError('Enter a deletion reason of at least 3 characters.')
      return
    }
    setDeleteError('')
    setDeleting(true)
    try {
      const result = await clientDeleteApi<{ archivedHistory?: boolean; message?: string }>(`/routers/${deleteModalRouter.id}`, { reason })
      setDeleteModalRouter(null)
      setDeleteReason('')
      setActionNotice({ tone: 'success', message: result.message || 'Router deleted.' })
      await loadData()
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }
"""
    if old_delete_handler in text:
        text = text.replace(old_delete_handler, new_delete_handler, 1)

    old_rename_action = """                                onClick={() => {
                                  setRenameModalOpen(router)
                                  setRenameName(router.name)
                                  setActiveMenuId(null)
                                }}
                              >
                                <Edit2 size={14} style={{ marginRight: 8 }} /> Rename
"""
    new_edit_action = """                                onClick={() => {
                                  setEditModalOpen(router)
                                  setActiveMenuId(null)
                                }}
                              >
                                <Edit2 size={14} style={{ marginRight: 8 }} /> Edit Router
"""
    if old_rename_action in text:
        text = text.replace(old_rename_action, new_edit_action, 1)

    old_delete_open = """                                onClick={() => {
                                  setDeleteModalRouter(router)
                                  setDeleteError('')
                                  setActiveMenuId(null)
                                }}
"""
    new_delete_open = """                                onClick={() => {
                                  setDeleteModalRouter(router)
                                  setDeleteReason('')
                                  setDeleteError('')
                                  setActiveMenuId(null)
                                }}
"""
    if old_delete_open in text:
        text = text.replace(old_delete_open, new_delete_open, 1)

    if '{/* MODAL: Full Router Edit */}' not in text:
        marker = "      {/* MODAL: Configuration Detail */}\n"
        edit_modal = """      {/* MODAL: Full Router Edit */}
      {editModalOpen && (
        <RouterFullEditModal
          router={editModalOpen}
          groups={overview?.groups ?? []}
          hotspots={hotspots?.items ?? []}
          onClose={() => setEditModalOpen(null)}
          onSaved={async () => {
            setActionNotice({
              tone: 'success',
              message: 'Router details saved. If you changed Wi-Fi or RouterOS network settings, run Get Setup Script once to apply them on the MikroTik.',
            })
            await loadData()
          }}
        />
      )}

"""
        text = replace_once(text, marker, edit_modal + marker, 'full edit modal placement')

    old_delete_copy = """            <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', marginBottom: 8 }}>
              You are about to permanently delete <strong>{deleteModalRouter.name}</strong>. This removes the router, its RADIUS client, and all health-check history from AROFi.
            </p>
            <p style={{ fontSize: 13, color: 'var(--danger-fg)', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: '10px 12px', marginBottom: 4 }}>
              This cannot be undone. Active sessions on this router will be orphaned until they expire naturally in RADIUS.
            </p>
            {deleteError && <p style={{ color: 'var(--danger-fg)', fontSize: 13, marginTop: 8 }}>{deleteError}</p>}
"""
    new_delete_copy = """            <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', marginBottom: 8 }}>
              Delete <strong>{deleteModalRouter.name}</strong> from active AROFi router management.
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', background: 'var(--bg-muted)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', marginBottom: 12 }}>
              If this router already has transactions, activations or sessions, AROFi will preserve that history for reports and audit while removing the router from the active list. A router with no protected history can be removed permanently.
            </p>
            <div className="form-group">
              <label className="form-label">Reason for deletion</label>
              <textarea
                className="form-input"
                rows={3}
                value={deleteReason}
                onChange={(event) => setDeleteReason(event.target.value)}
                placeholder="e.g. Router replaced, site closed, duplicate registration"
                required
              />
            </div>
            {deleteError && <p style={{ color: 'var(--danger-fg)', fontSize: 13, marginTop: 8 }}>{deleteError}</p>}
"""
    if old_delete_copy in text:
        text = text.replace(old_delete_copy, new_delete_copy, 1)

    text = text.replace(
        "                disabled={deleting}\n              >\n                {deleting ? 'Deleting...' : 'Delete Router'}",
        "                disabled={deleting || deleteReason.trim().length < 3}\n              >\n                {deleting ? 'Deleting...' : 'Delete Router'}",
        1,
    )

    for invariant in (
        "Edit Router",
        "RouterFullEditModal",
        "deleteReason",
        "clientDeleteApi<{ archivedHistory?: boolean; message?: string }>",
    ):
        if invariant not in text:
            raise RuntimeError(f'router settings UI invariant missing: {invariant}')

    PAGE.write_text(text, encoding='utf-8')


def main() -> None:
    for path in (DTO, CONTROLLER, LIFECYCLE, ROUTERS_SERVICE, OVERVIEW, CLIENT_API, PAGE, COMPONENT):
        require(path)
    write_update_dto()
    patch_controller()
    patch_lifecycle()
    patch_routers_service()
    patch_overview()
    patch_client_api()
    patch_settings_page()
    print(
        'Router full-management enabled: all onboarding details are editable except protected IDs/registration/RADIUS secrets; '
        'deletion requires a reason and preserves historical transactions by archival deletion when necessary.'
    )


if __name__ == '__main__':
    main()
