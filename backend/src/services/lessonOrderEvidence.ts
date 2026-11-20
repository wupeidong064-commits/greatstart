import { Prisma } from '@prisma/client';

type Link = {id:string;studentId:string;conversionId:string|null;notes:string|null};
export const printedOrderId = (notes:string|null)=>/^(?:新签|续费)入账：(.+)$/.exec(notes || '')?.[1];

export async function readOrderEvidence(tx:Prisma.TransactionClient,organizationId:string,ids:string[]) {
  const postings=new Map<string,Link[]>(), renewals=new Map<string,string[]>();
  if (ids.length) {
    const [credits,receipts]=await Promise.all([
      tx.lessonLog.findMany({where:{organizationId,type:'add',OR:[{conversionId:{in:ids}},
        {notes:{in:ids.flatMap(id=>['新签入账：'+id,'续费入账：'+id])}}]},
        select:{id:true,studentId:true,conversionId:true,notes:true}}),
      tx.$queryRaw<Array<{id:string;studentId:string}>>`SELECT response #>> '{conversion,id}' AS id,"studentId"
        FROM renewal_requests WHERE "organizationId"=${organizationId} AND response #>> '{conversion,id}' IN (${Prisma.join(ids)})`,
    ]);
    for (const row of credits) for (const id of new Set([row.conversionId,printedOrderId(row.notes)])) {
      if (!id) continue;
      const group=postings.get(id) ?? [];
      group.push(row);postings.set(id,group);
    }
    for (const row of receipts) {
      const group=renewals.get(row.id) ?? [];
      group.push(row.studentId);renewals.set(row.id,group);
    }
  }
  return {
    allows(orderId:string,studentId:string,creditId?:string,alreadyLinked=false) {
      const credits=postings.get(orderId) ?? [], receipts=renewals.get(orderId) ?? [];
      if (receipts.length>1 || receipts.some(s=>s!==studentId) || credits.length>1) return false;
      const linked=credits[0];
      if (linked && (linked.studentId!==studentId || creditId && linked.id!==creditId ||
        linked.conversionId && printedOrderId(linked.notes) && linked.conversionId!==printedOrderId(linked.notes))) return false;
      return !creditId || !receipts.length || alreadyLinked;
    },
  };
}
