import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common'
import { AgentsService } from './agents.service'
import { AgentFloatAdjustmentDto } from './dto/agent-float-adjustment.dto'
import { CreateAgentDto } from './dto/create-agent.dto'
import { CreateDisbursementDto } from './dto/create-disbursement.dto'
import { CreateSettlementDto } from './dto/create-settlement.dto'

@Controller('agents')
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  @Get('overview')
  getOverview(@Query('tenantId') tenantId?: string) {
    return this.agentsService.getOverview(tenantId)
  }

  @Get('float/overview')
  getFloatOverview(@Query('tenantId') tenantId?: string) {
    return this.agentsService.getFloatOverview(tenantId)
  }

  @Get('disbursements/overview')
  getDisbursementOverview(@Query('tenantId') tenantId?: string) {
    return this.agentsService.getDisbursementOverview(tenantId)
  }

  @Post()
  createAgent(@Body() dto: CreateAgentDto) {
    return this.agentsService.createAgent(dto)
  }

  @Post(':agentId/float-topups')
  loadFloat(@Param('agentId') agentId: string, @Body() dto: AgentFloatAdjustmentDto) {
    return this.agentsService.loadFloat(agentId, dto)
  }

  @Post(':agentId/float-returns')
  returnFloat(@Param('agentId') agentId: string, @Body() dto: AgentFloatAdjustmentDto) {
    return this.agentsService.returnFloat(agentId, dto)
  }

  @Post(':agentId/settlements')
  createSettlement(@Param('agentId') agentId: string, @Body() dto: CreateSettlementDto) {
    return this.agentsService.createSettlement(agentId, dto)
  }

  @Post(':agentId/disbursements')
  createDisbursement(@Param('agentId') agentId: string, @Body() dto: CreateDisbursementDto) {
    return this.agentsService.createDisbursement(agentId, dto)
  }
}
