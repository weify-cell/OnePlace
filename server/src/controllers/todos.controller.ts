import { Request, Response } from 'express'
import * as todosService from '../services/todos.service.js'

export function getTodos(req: Request, res: Response): void {
  const { status, priority, task_kind, type, tag, search, page, pageSize, sortBy, sortOrder } = req.query
  const result = todosService.getTodos({
    status: status as string,
    priority: priority as string,
    task_kind: task_kind as string,
    type: type as string,
    tag: tag as string,
    search: search as string,
    page: page ? Number(page) : 1,
    pageSize: pageSize ? Number(pageSize) : 20,
    sortBy: sortBy as string,
    sortOrder: sortOrder as 'asc' | 'desc'
  })
  res.json(result)
}

export function getTodo(req: Request, res: Response): void {
  const todo = todosService.getTodoById(Number(req.params.id))
  if (!todo) {
    res.status(404).json({ error: 'NotFound' })
    return
  }
  res.json(todo)
}

export function createTodo(req: Request, res: Response): void {
  const todo = todosService.createTodo(req.body)
  res.status(201).json(todo)
}

export function updateTodo(req: Request, res: Response): void {
  const todo = todosService.updateTodo(Number(req.params.id), req.body)
  if (!todo) {
    res.status(404).json({ error: 'NotFound' })
    return
  }
  res.json(todo)
}

export function updateTodoProgress(req: Request, res: Response): void {
  try {
    const todo = todosService.updateTodoProgress(Number(req.params.id), req.body)
    if (!todo) {
      res.status(404).json({ error: 'NotFound' })
      return
    }
    res.json(todo)
  } catch (error) {
    res.status(400).json({ error: (error as Error).message })
  }
}

export function getTodoProgressLogs(req: Request, res: Response): void {
  try {
    const logs = todosService.getTodoProgressLogs(
      Number(req.params.id),
      req.query.limit ? Number(req.query.limit) : 10
    )
    if (!logs) {
      res.status(404).json({ error: 'NotFound' })
      return
    }
    res.json(logs)
  } catch (error) {
    res.status(400).json({ error: (error as Error).message })
  }
}

export function deleteTodo(req: Request, res: Response): void {
  const deleted = todosService.deleteTodo(Number(req.params.id))
  if (!deleted) {
    res.status(404).json({ error: 'NotFound' })
    return
  }
  res.status(204).send()
}

export function getTodoTags(req: Request, res: Response): void {
  res.json(todosService.getAllTodoTags())
}

export function getTodoCounts(req: Request, res: Response): void {
  res.json(todosService.getTodoCounts())
}

export function getPendingCount(req: Request, res: Response): void {
  res.json({ count: todosService.getPendingCount() })
}

export function getUrgentCount(req: Request, res: Response): void {
  res.json({ count: todosService.getUrgentCount() })
}
