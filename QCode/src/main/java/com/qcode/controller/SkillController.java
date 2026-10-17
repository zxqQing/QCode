package com.qcode.controller;


import com.qcode.domain.vo.SkillVO;
import com.qcode.service.SkillService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;

@RestController
@RequestMapping({"/skill"})
@CrossOrigin(origins = {"http://127.0.0.1:5173", "http://127.0.0.1:3000", "http://localhost:5173", "http://localhost:3000"})
@RequiredArgsConstructor
public class SkillController {
    private final SkillService skillService;

    @GetMapping("/list")
    public List<SkillVO> listSkills() throws IOException {
        return skillService.listSkills();
    }
    @GetMapping("/{name}")
    public String getSkill(@PathVariable String name) throws IOException {
        return skillService.getSkill(name);
    }

    @DeleteMapping("/{name}")
    public void deleteSkill(@PathVariable String name) throws IOException {
        skillService.deleteSkill(name);
    }

    @PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public SkillVO uploadSkill(@RequestParam("files") List<MultipartFile> files, @RequestParam("paths") List<String> paths) throws IOException {
        return skillService.uploadSkill(files, paths);
    }
}
