import { searchAirtable, getMemberContext as getAirtableMemberContext } from '../connectors/airtable.js';
import { getMemberstackProfile } from '../connectors/memberstack.js';

export async function unifiedSearch({ query, scope }) {
  const airtableResults = await searchAirtable(query, scope);
  return airtableResults;
}

export async function buildMemberContext(memberId) {
  const airtable = await getAirtableMemberContext(memberId);
  const memberstack = await getMemberstackProfile(memberId);
  return {
    member: {
      ...airtable.member,
      memberstack_status: memberstack.status
    },
    context: airtable.context
  };
}
