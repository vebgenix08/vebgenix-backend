import { Template } from '@vebgenix/db';
import { AppError } from '@vebgenix/errors';
import { authorize } from '@vebgenix/permissions';
import type { AuthContext } from '@vebgenix/auth';

function toGql(doc: unknown): Record<string, unknown> | null {
  if (!doc) return null;
  const plain = JSON.parse(JSON.stringify(doc)) as Record<string, unknown>;
  const { _id, __v, ...rest } = plain;
  return _id !== undefined ? { id: String(_id), ...rest } : rest;
}

export async function handleTemplates(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  tenantId: string,
): Promise<unknown> {
  switch (operation) {

    case 'listTemplates':
    case 'GET:/api/admin/settings/templates': {
      const filter = args.type ? { type: args.type } : {};
      const docs = await Template.find({ tenantId, ...filter }).sort({ name: 1 }).lean();
      return docs.map(d => toGql(d));
    }

    case 'getTemplate':
    case 'GET:/api/admin/settings/templates/:id':
      return toGql(await Template.findOne({ tenantId, _id: args.id as string }).lean());

    case 'createTemplate':
    case 'POST:/api/admin/settings/templates': {
      authorize(ctx, 'settings.templates.create');
      const input = (args.input as Record<string, unknown>) ?? args;
      const doc = await Template.create({
        ...input,
        tenantId,
        createdBy:      ctx.membership!.profileId,
        currentVersion: 0,
        versions:       [],
      });
      return toGql(doc.toObject());
    }

    case 'updateTemplate':
    case 'PATCH:/api/admin/settings/templates/:id': {
      authorize(ctx, 'settings.templates.update');
      const { id, ...input } = args as Record<string, unknown>;
      return toGql(await Template.findOneAndUpdate(
        { tenantId, _id: id as string },
        { $set: input },
        { new: true },
      ).lean());
    }

    case 'publishTemplateVersion':
    case 'POST:/api/admin/settings/templates/:id/publish': {
      authorize(ctx, 'settings.templates.publish');
      const tmpl = await Template.findOne({ tenantId, _id: args.id as string });
      if (!tmpl) throw new AppError('NOT_FOUND', 'Template not found');
      const nextVersion = (tmpl.currentVersion ?? 0) + 1;
      tmpl.versions.push({
        version:     nextVersion,
        content:     args.content as string,
        variables:   (args.variables as string[]) ?? [],
        publishedAt: new Date(),
        publishedBy: ctx.membership!.profileId,
      });
      tmpl.currentVersion = nextVersion;
      tmpl.status         = 'PUBLISHED';
      await tmpl.save();
      return toGql(tmpl.toObject());
    }

    case 'deleteTemplate':
    case 'DELETE:/api/admin/settings/templates/:id': {
      authorize(ctx, 'settings.templates.delete');
      return toGql(await Template.findOneAndDelete({ tenantId, _id: args.id as string }).lean());
    }

    default:
      return undefined;
  }
}
