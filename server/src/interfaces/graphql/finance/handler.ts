import { resolveContext } from '../context';
import { FinanceService } from '../../../domain/finance/finance-service';

export const handler = async (event: any) => {
  const { fieldName, arguments: args, identity } = event;
  const ctx = await resolveContext(identity);

  console.log(`[FinanceResolver] ${fieldName}`);

  switch (fieldName) {
    case 'createFeeHead':
      return FinanceService.createFeeHead(ctx, args.input.name, args.input.type);
    case 'createFeeStructure':
      return FinanceService.createFeeStructure(ctx, args.input.name);
    default:
      throw new Error(`Unknown field: ${fieldName}`);
  }
};
