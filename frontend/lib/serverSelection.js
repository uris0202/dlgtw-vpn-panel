export function selectServersForPlan(currentIds, servers, limit) {

    const normalizedLimit = Math.max(1, Number(limit) || 1);
    const availableIds = getAvailableServerIds(servers);
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

export function getServerSelectionStatus(currentIds, servers, limit) {

    const requiredCount = Math.max(1, Number(limit) || 1);
    const availableIds = getAvailableServerIds(servers);
    const availableIdSet = new Set(availableIds);
    const selectedIds = Array.from(
        new Set(
            (currentIds || [])
                .map(Number)
                .filter((serverId) => availableIdSet.has(serverId))
        )
    );

    return {
        requiredCount,
        availableCount: availableIds.length,
        selectedCount: selectedIds.length,
        hasEnoughServers: availableIds.length >= requiredCount,
        isComplete: selectedIds.length === requiredCount,
        allServersRequired: (
            availableIds.length > 0
            && availableIds.length === requiredCount
        ),
    };

}

export function getServerSelectionMessage(selection) {
    if (!selection.hasEnoughServers) {
        return `Для тарифа нужно серверов: ${selection.requiredCount}. Сейчас доступно: ${selection.availableCount}.`;
    }

    if (selection.allServersRequired && selection.isComplete) {
        return "Все доступные серверы включены в тариф и выбраны автоматически.";
    }

    return `Выбрано ${selection.selectedCount} из ${selection.requiredCount} серверов.`;
}

function getAvailableServerIds(servers) {

    return Array.from(
        new Set(
            (servers || [])
                .map((server) => Number(server.id))
                .filter(Number.isFinite)
        )
    );

}
