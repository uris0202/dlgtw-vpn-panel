export function selectServersForPlan(currentIds, servers, limit) {

    const normalizedLimit = Math.max(1, Number(limit) || 1);
    const availableIds = Array.from(
        new Set(
            (servers || [])
                .map((server) => Number(server.id))
                .filter(Number.isFinite)
        )
    );
    const availableIdSet = new Set(availableIds);
    const selectedIds = [];

    for (const value of currentIds || []) {
        const serverId = Number(value);

        if (
            availableIdSet.has(serverId)
            && !selectedIds.includes(serverId)
        ) {
            selectedIds.push(serverId);
        }

        if (selectedIds.length === normalizedLimit) {
            return selectedIds;
        }
    }

    for (const serverId of availableIds) {
        if (!selectedIds.includes(serverId)) {
            selectedIds.push(serverId);
        }

        if (selectedIds.length === normalizedLimit) {
            break;
        }
    }

    return selectedIds;

}
