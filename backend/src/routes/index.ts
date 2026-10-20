import { Router } from 'express'
import { accountsRouter } from './accounts.ts'
import { messagesRouter } from './messages.ts'
import { rulesRouter } from './rules.ts'
import { aiRouter } from './ai.ts'
import { systemRouter } from './system.ts'

export const apiRouter = Router()

apiRouter.use('/accounts', accountsRouter)
apiRouter.use('/messages', messagesRouter)
apiRouter.use('/rules', rulesRouter)
apiRouter.use('/ai', aiRouter)
apiRouter.use('/', systemRouter)
