import { HttpClient } from "./http.js";
import { baseURL, timetable } from "./const.js";
import { recognizeCaptcha } from "./captcha.js";
import { parseLoginLink, parseFullTable, parseBeginDate } from "./parse.js";
import { Course, School } from "./ical.js";

export interface CourseData {
  name: string;
  teacher: string;
  classroom: string;
  weekday: number;
  weeks: number[];
  indexes: number[];
}

export interface RawCourse {
  name: string;
  teacher: string;
  location: string;
  weekday: number;
  index: number;
  duration: number;
  week: [number, number];
  odd: boolean;
  even: boolean;
}

export interface CourseFetchResult {
  courses: CourseData[];
  rawCourses: RawCourse[];
  startDate: [number, number, number];
  timetable: [number, number][];
  icsContent: string;
}

export async function fetchCourseData(
  username: string,
  password: string,
  semester: string,
  year: string,
): Promise<CourseFetchResult> {
  const client = new HttpClient(baseURL);

  let res = await client.get("default.asp");
  const loginURL = await parseLoginLink(await res.text());
  if (!loginURL) throw new Error("无法解析登录表单，教务系统页面可能已变更");

  res = await client.get("ValidateCookie.asp");
  const captchaBuf = await res.arrayBuffer();
  const captcha = recognizeCaptcha(captchaBuf);

  res = await client.post(loginURL, {
    muser: username,
    passwd: password,
    code: captcha,
  });
  client.setCookie("muser", username);

  res = await client.post("kb/kb_xs.asp", {
    xn: year,
    xq: semester,
  });

  const fullCourse = await res.text();
  if (fullCourse.includes("出错提示")) {
    throw new Error("用户名或密码错误");
  }

  const rawCourses = await parseFullTable(fullCourse);
  if (!rawCourses || !rawCourses.length) {
    throw new Error("未解析到任何课程数据，可能该学期暂无课程安排");
  }

  const courses: CourseData[] = rawCourses.map((c: any) => {
    const weeks = c.odd
      ? Course.oddWeek(...(c.week ?? [1, 18]))
      : c.even
        ? Course.evenWeek(...(c.week ?? [1, 18]))
        : Course.week(...(c.week ?? [1, 18]));

    return {
      name: c.name ?? "",
      teacher: c.teacher ?? "",
      classroom: c.location ?? "",
      weekday: c.weekday ?? 1,
      weeks,
      indexes: [c.index ?? 1, (c.index ?? 1) + (c.duration ?? 1) - 1],
    };
  });

  res = await client.get(`kb/zkb_xs.asp?week1=1&kkxq=${year}${semester}`);
  const beginDate = (await parseBeginDate(await res.text())) as [number, number, number];

  const timetableTyped: [number, number][] = timetable as [number, number][];

  const courseObjs = courses.map(
    (c) =>
      new Course({
        name: c.name,
        teacher: c.teacher,
        classroom: c.classroom,
        location: c.classroom,
        weekday: c.weekday,
        weeks: c.weeks,
        indexes: c.indexes,
      }),
  );

  const school = new School({
    start: beginDate,
    timetable: timetableTyped,
    courses: courseObjs,
  });

  const icsContent = school.generate();

  return {
    courses,
    rawCourses: rawCourses as RawCourse[],
    startDate: beginDate,
    timetable: timetableTyped,
    icsContent,
  };
}
