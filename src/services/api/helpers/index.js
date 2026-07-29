export function amplifyErrorMessage(errors, fallback = "La operación no pudo completarse.") {
  const message = (errors ?? [])
    .map((error) => error?.message)
    .filter(Boolean)
    .join("; ");
  return message || fallback;
}

export function unwrapAmplifyResult(result, fallback) {
  if (result?.errors?.length) throw new Error(amplifyErrorMessage(result.errors, fallback));
  if (result?.data == null) throw new Error(fallback);
  return result.data;
}

export async function collectAmplifyPages(fetchPage) {
  const rows = [];
  let nextToken = null;
  do {
    const response = await fetchPage(nextToken);
    if (response?.errors?.length) throw new Error(amplifyErrorMessage(response.errors));
    rows.push(...(response?.data ?? []));
    nextToken = response?.nextToken ?? null;
  } while (nextToken);
  return rows;
}

export function identityValues(session) {
  return [...new Set([
    session?.userId,
    session?.username,
    session?.email,
    session?.identityKey,
  ].filter(Boolean))];
}
