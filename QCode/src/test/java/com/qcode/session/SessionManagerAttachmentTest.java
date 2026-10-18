package com.qcode.session;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class SessionManagerAttachmentTest {

    @TempDir
    Path tempHome;

    @Test
    void restoresAttachmentPathsAndImageDataWithoutExposingTheAgentDirective() throws Exception {
        String previousHome = System.getProperty("user.home");
        System.setProperty("user.home", tempHome.toString());
        try {
            Path stateFile = tempHome.resolve(".qcode/projects/default/state/qing/session/agent_state.json");
            Files.createDirectories(stateFile.getParent());
            Files.writeString(stateFile, """
                    {
                      "context": [{
                        "id": "message-1",
                        "role": "USER",
                        "timestamp": "2026-10-18T05:00:00Z",
                        "content": [
                          {
                            "type": "text",
                            "text": "请查看附件\\n\\n已上传附件。请按需读取以下路径：\\n- attachments/session/12345678-1234-1234-1234-123456789012_photo.png\\n- attachments/session/12345678-1234-1234-1234-123456789012_notes.md\\n"
                          },
                          {
                            "type": "image",
                            "source": {"type": "base64", "media_type": "image/png", "data": "YWJj"}
                          }
                        ]
                      }]
                    }
                    """, StandardCharsets.UTF_8);

            List<SessionMessage> messages = new SessionManager().getSessionMessagesFromState("session", null);

            assertEquals(2, messages.size());
            assertEquals("请查看附件", messages.getFirst().getContent());
            assertEquals(List.of(
                    "attachments/session/12345678-1234-1234-1234-123456789012_photo.png",
                    "attachments/session/12345678-1234-1234-1234-123456789012_notes.md"
            ), messages.getFirst().getAttachmentPaths());
            assertEquals("image/png", messages.get(1).getMediaType());
            assertEquals("YWJj", messages.get(1).getData());
        } finally {
            if (previousHome == null) {
                System.clearProperty("user.home");
            } else {
                System.setProperty("user.home", previousHome);
            }
        }
    }
}
