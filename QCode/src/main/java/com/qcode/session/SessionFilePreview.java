package com.qcode.session;

public record SessionFilePreview(
        String absolutePath,
        String relativePath,
        String rootName,
        String language,
        String content
) { }
