package com.qcode.diff;

public record SessionChangeFile(
        String path,
        String absolutePath,
        String type,
        int additions,
        int deletions,
        boolean binary,
        String oldContent,
        String newContent
) { }
