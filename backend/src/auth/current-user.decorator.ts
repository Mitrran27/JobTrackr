import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** Returns the authenticated user's id */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  return ctx.switchToHttp().getRequest().user.id;
});
