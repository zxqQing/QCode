package com.qcode.service;

import com.qcode.domain.vo.SkillVO;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;

public interface SkillService {
    List<SkillVO> listSkills() throws IOException;

    String getSkill(String name) throws IOException;

    void deleteSkill(String name) throws IOException;

    SkillVO uploadSkill(List<MultipartFile> files, List<String> paths) throws IOException;
}
