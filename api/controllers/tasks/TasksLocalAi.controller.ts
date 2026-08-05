import type {TaskControllerShared} from '../../types/tasks'
import type {ApiRequest, ApiResponse} from '../../types/http'
import { apiErrorMessage, sendControllerError } from '../../types/errors'
import {
  deleteLocalAiModel,
  getLocalAiStatus,
  isLocalAiEnabled,
  iterateDownloadLocalAi,
  iterateLocalAiChat,
  setLocalAiEnabled,
  type LocalAiChatRequest,
} from '../../services/localLlm'
import {ASSISTANT_TOOLS, executeAssistantTool, type AssistantToolCall} from '../../services/assistantTools'

export default function createTasksLocalAiController(shared: TaskControllerShared) {
  const {
    db,
    createStreamAbortSignal,
  } = shared

  const writeNdjson = (res: ApiResponse, event: Record<string, unknown>) => {
    res.write(`${JSON.stringify(event)}\n`)
  }

  const localAiStatus = async (_req: ApiRequest, res: ApiResponse) => {
    try {
      res.status(200).send(getLocalAiStatus(db))
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while checking Local AI status.')
    }
  }

  const setLocalAiEnabledHandler = async (req: ApiRequest, res: ApiResponse) => {
    try {
      const enabled = Boolean(req.body?.enabled)
      setLocalAiEnabled(db, enabled)
      res.status(200).send(getLocalAiStatus(db))
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while updating Local AI settings.')
    }
  }

  const streamDownloadLocalAi = async (req: ApiRequest, res: ApiResponse) => {
    try {
      res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('X-Accel-Buffering', 'no')
      const shouldStop = createStreamAbortSignal(req, res)
      for await (const event of iterateDownloadLocalAi(db, {shouldStop})) {
        writeNdjson(res, event)
      }
      res.end()
    } catch (err) {
      writeNdjson(res, {
        type: 'error',
        message: apiErrorMessage(err) || 'Some error occurred while downloading Local AI model.',
      })
      res.end()
    }
  }

  const deleteLocalAi = async (_req: ApiRequest, res: ApiResponse) => {
    try {
      if (!isLocalAiEnabled(db)) {
        // Allow delete even when disabled so users can free disk space.
      }
      const result = deleteLocalAiModel(db)
      res.status(200).send({...result, status: getLocalAiStatus(db)})
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while deleting Local AI model.')
    }
  }

  const streamLocalAiChat = async (req: ApiRequest, res: ApiResponse) => {
    try {
      res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('X-Accel-Buffering', 'no')
      const shouldStop = createStreamAbortSignal(req, res)

      const chatReq: LocalAiChatRequest = {
        mode: req.body?.mode,
        locale: req.body?.locale,
        messages: Array.isArray(req.body?.messages) ? req.body.messages : [],
        context: req.body?.context && typeof req.body.context === 'object' ? req.body.context : {},
        system: req.body?.system,
      }

      // Optional explicit tool execution (confirm / client-driven)
      if (req.body?.toolCall && typeof req.body.toolCall === 'object') {
        const toolCall = req.body.toolCall as AssistantToolCall
        const confirmed = Boolean(req.body.confirmTool)
        const toolDef = ASSISTANT_TOOLS.find((t) => t.name === toolCall.name)
        if (toolDef?.needsConfirmation && !confirmed) {
          writeNdjson(res, {
            type: 'tool_call',
            id: toolCall.id || `tool_${Date.now()}`,
            name: toolCall.name,
            arguments: toolCall.arguments || {},
            needsConfirmation: true,
          })
          res.end()
          return
        }
        const result = await executeAssistantTool(db, toolCall, {locale: chatReq.locale})
        writeNdjson(res, {
          type: 'tool_result',
          id: toolCall.id || `tool_${Date.now()}`,
          name: toolCall.name,
          result: result.result,
          ok: result.ok,
        })
        res.end()
        return
      }

      for await (const event of iterateLocalAiChat(db, chatReq, {shouldStop})) {
        writeNdjson(res, event as unknown as Record<string, unknown>)
      }
      res.end()
    } catch (err) {
      writeNdjson(res, {
        type: 'error',
        message: apiErrorMessage(err) || 'Some error occurred while running Local AI chat.',
      })
      res.end()
    }
  }

  const localAiTools = async (_req: ApiRequest, res: ApiResponse) => {
    try {
      res.status(200).send({tools: ASSISTANT_TOOLS})
    } catch (err) {
      sendControllerError(res, err, 'Some error occurred while listing Local AI tools.')
    }
  }

  return {
    localAiStatus,
    setLocalAiEnabled: setLocalAiEnabledHandler,
    streamDownloadLocalAi,
    deleteLocalAi,
    streamLocalAiChat,
    localAiTools,
  }
}
