// Resolve hook for scripts/ts-resolve.mjs: retry a relative import that doesn't resolve with ".ts" added.
export async function resolve(spec, ctx, next) {
  try {
    return await next(spec, ctx);
  } catch (e) {
    if (e && e.code === "ERR_MODULE_NOT_FOUND" && /^\.{1,2}\//.test(spec) && !/\.\w+$/.test(spec)) return next(spec + ".ts", ctx);
    throw e;
  }
}
