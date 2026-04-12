// TODO: Replace with real Memberstack API calls
export async function getMemberstackProfile(memberId) {
  return {
    member_id: memberId,
    source: 'memberstack',
    status: 'active'
  };
}
