export const RELATIONSHIP_MODES = Object.freeze({ QUALITATIVE:'qualitative', NUMERIC:'numeric' });
export const RELATIONSHIP_OPS = Object.freeze({ SET:'set', MERGE:'merge', DELETE:'delete', INCREMENT:'increment' });
export function createRelationshipDelta({chatId,relationshipId,changes=[],reason='',evidence=[],source='system',importance=.5,signal=null}){
  return {id:`rd_${Date.now()}_${Math.random().toString(36).slice(2)}`,chatId,relationshipId,changes,reason,evidence,source,importance,signal,status:'active',createdAt:Date.now(),updatedAt:Date.now()};
}
