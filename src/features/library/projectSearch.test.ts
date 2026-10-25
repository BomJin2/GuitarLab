import { expect, it } from 'vitest';
import { projectFixture } from '../../test/projectFixture';
import { filterProjects } from './projectSearch';

it('제목/아티스트의 모든 단어·대소문자/전각/한글 조합을 찾고 입력/정렬을 보존한다', () => {
  const base = projectFixture().project;
  const projects = [
    { ...base, id: 'first', title: 'ＡＣ／ＤＣ 기타 [a+b]', artist: '연주자' },
    { ...base, id: 'second', title: '기타 연습', artist: null },
    { ...base, id: 'third', title: '다른 곡', artist: 'AC/DC' },
  ];
  const before = JSON.stringify(projects);
  expect(filterProjects(projects, 'ac/dc 연주자')).toEqual([projects[0]]);
  expect(filterProjects(projects, '기타')).toEqual([
    projects[0],
    projects[1],
  ]);
  expect(filterProjects(projects, '[a+b]')).toEqual([projects[0]]);
  expect(filterProjects(projects, '다른 곡 ac/dc')).toEqual([projects[2]]);
  expect(filterProjects(projects, '기타 \n\t 연습')).toEqual([projects[1]]);
  expect(filterProjects(projects, '*')).toEqual([]);
  expect(filterProjects(projects, '기타 없는단어')).toEqual([]);
  expect(filterProjects(projects, '   \t')).toBe(projects);
  expect(filterProjects(projects, '')).toBe(projects);
  expect(JSON.stringify(projects)).toBe(before);
});
it('200 코드포인트 경계는 허용하고 초과 검색과 빈 목록을 구분한다', () => {
  expect(filterProjects([], '🎸'.repeat(200))).toEqual([]);
  expect(filterProjects([], '가'.repeat(201))).toBeNull();
  expect(filterProjects([], '🎸'.repeat(201))).toBeNull();
  expect(filterProjects([], ' '.repeat(401))).toBeNull();
});
