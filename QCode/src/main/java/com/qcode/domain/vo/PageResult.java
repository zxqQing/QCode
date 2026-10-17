package com.qcode.domain.vo;

import java.util.List;

public record PageResult<T>(List<T> items, String nextCursor, boolean hasMore) {
    public static <T> PageResult<T> of(List<T> items, int offset, int limit, int total) {
        boolean hasMore = offset + items.size() < total;
        String next = hasMore ? String.valueOf(offset + items.size()) : null;
        return new PageResult<>(items, next, hasMore);
    }
}
