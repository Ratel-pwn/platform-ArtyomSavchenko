import { type MigrationClient } from '@hcengineering/model'
import { githubId } from '@hcengineering/github'
import tracker from '@hcengineering/tracker'
import { DOMAIN_GITHUB, DOMAIN_GITHUB_SYNC } from '.'
import { githubOperationPreTime } from './migration'

describe('GitHub sync migration', () => {
  it('keeps current links while moving legacy records and filling missing records', async () => {
    const current = { _id: 'current', url: 'https://github.com/example/repo/issues/19', githubNumber: 19 }
    const legacy = { _id: 'legacy', url: 'https://github.com/example/repo/issues/20', githubNumber: 20 }
    const currentRows = new Map([[current._id, current]])
    const legacyRows = new Map([[legacy._id, legacy]])
    const project = { _id: 'project' }
    const issues = ['current', 'legacy', 'missing'].map(_id => ({
      _id,
      _class: tracker.class.Issue,
      space: project._id,
      modifiedOn: 1,
      modifiedBy: 'author'
    }))
    const iterator = { next: jest.fn().mockResolvedValueOnce(issues).mockResolvedValue(null), close: jest.fn() }
    const logger = { log: jest.fn(), error: jest.fn() }
    const client = {
      logger,
      migrateState: new Map([[githubId, new Set([
        'fix-todo-spaces', 'remove-github-components', 'markup', 'migrate-missing-states', 'remove-doc-sync-info-txes'
      ])]]),
      hierarchy: { hasMixin: () => false },
      find: jest.fn(async (domain: string) => {
        if (domain === DOMAIN_GITHUB) return [...legacyRows.values()]
        if (domain === DOMAIN_GITHUB_SYNC) return [...currentRows.values()]
        return [project]
      }),
      traverse: async () => iterator,
      create: async (domain: string, row: typeof current) => {
        if (domain === DOMAIN_GITHUB) legacyRows.set(row._id, row)
      },
      move: async (from: string, _query: unknown, to: string) => {
        if (from === DOMAIN_GITHUB && to === DOMAIN_GITHUB_SYNC) {
          for (const [id, row] of legacyRows) currentRows.set(id, row)
          legacyRows.clear()
        }
      }
    } as unknown as MigrationClient

    await githubOperationPreTime.migrate(client, 'upgrade')

    expect(logger.error).not.toHaveBeenCalled()
    expect(currentRows.get('current')).toEqual(current)
    expect(currentRows.get('legacy')).toEqual(legacy)
    expect(currentRows.get('missing')).toMatchObject({ url: '', githubNumber: 0, externalVersion: '#' })
    expect(legacyRows.size).toBe(0)
  })
})
