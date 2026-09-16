import { describe, expect, it } from 'vitest';
import { createLocalDemoRepository, firstRunPrefs } from './localDemoRepository.js';
import { WriteNotAllowedError } from './repository.js';

describe('the local demo repository refuses to fake a write', () => {
  const repo = createLocalDemoRepository();

  it('declares that it cannot write', () => {
    expect(repo.capabilities().canWrite).toBe(false);
    expect(repo.capabilities().source).toBe('local-demo');
  });

  it('rejects saveRecipe with an explanation instead of pretending', () => {
    // This is the shape of bug B8 was: a message claiming a file was written.
    return expect(repo.saveRecipe({ id: 'x' })).rejects.toBeInstanceOf(
      WriteNotAllowedError,
    );
  });

  it('serves the five demo recipes', async () => {
    const list = await repo.listRecipes();
    expect(list).toHaveLength(5);
    expect(await repo.getRecipe('brioche')).not.toBeNull();
    expect(await repo.getRecipe('nope')).toBeNull();
  });

  it('starts a first-time visitor before onboarding, not after', () => {
    expect(firstRunPrefs().done).toBe(false);
    expect(firstRunPrefs().profile).toBe('pro');
  });
});
