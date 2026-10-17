package com.qcode.diff;

import java.util.List;

public record SessionChangesResponse(
        boolean available,
        String reason,
        String projectRoot,
        int additions,
        int deletions,
        List<SessionChangeFile> files
) {
    public static SessionChangesResponse unavailable(String reason, String projectRoot) {
        return new SessionChangesResponse(false, reason, projectRoot, 0, 0, List.of());
    }
}
