package com.qcode.service.impl;

import com.qcode.domain.vo.SkillVO;
import com.qcode.service.SkillService;
import com.qcode.skill.SkillManager;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;

@Service
@RequiredArgsConstructor
public class SkillServiceImpl implements SkillService {
    private final SkillManager skillManager;
    @Override
    public List<SkillVO> listSkills() throws IOException {
        return skillManager.listSkills();
    }

    @Override
    public String getSkill(String name) throws IOException {
        return skillManager.getSkill(name);
    }

    @Override
    public void deleteSkill(String name) throws IOException {
        skillManager.deleteSkill(name);
    }

    @Override
    public SkillVO uploadSkill(List<MultipartFile> files, List<String> paths) throws IOException {
        return skillManager.uploadSkill(files, paths);
    }

}
