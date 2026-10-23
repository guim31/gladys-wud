// -----------------------------------------------------------------------------
// Scene action handlers (manifest `scene_actions`, Gladys 5.1+).
//
// - `check_now`: WUD asks the registries again now, for one container or every
//   container (an empty device field, or the What's Up Docker device). Say
//   every Sunday morning, before reading the updates out, or right after a
//   container was updated by hand. The result fires the usual scene events.
//   Never updates a container.
// -----------------------------------------------------------------------------

export const SCENE_ACTIONS = {
  async check_now(hub, { fields = {} }) {
    return { count: await hub.check(fields.device) };
  },
};
