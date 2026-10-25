import { z } from 'zod';

export const degrees = ['高中/中专', '专科', '本科', '硕士', '博士', '其他'] as const;
const month = z.string().regex(/^(?:|\d{4}-(?:0[1-9]|1[0-2]))$/);
export const educationSchema = z.object({ id: z.string().min(1).max(100), school: z.string().trim().max(150), major: z.string().trim().max(150), degree: z.enum(degrees).or(z.literal('')), startMonth: month, endMonth: month }).refine(row => !row.startMonth || !row.endMonth || row.endMonth >= row.startMonth, '毕业时间不能早于入学时间');
export const personalProfileSchema = z.object({ id: z.literal('personal'), name: z.string().trim().max(80), location: z.string().trim().max(150), targetRole: z.string().trim().max(150), experienceYears: z.number().min(0).max(60).optional(), education: z.array(educationSchema).max(8), skills: z.array(z.string().trim().min(1).max(80)).max(50), summary: z.string().trim().max(3000), updatedAt: z.string().refine(value => Number.isFinite(Date.parse(value))) });
export type PersonalProfile = z.infer<typeof personalProfileSchema>;
export const emptyPersonalProfile = (): PersonalProfile => ({ id: 'personal', name: '', location: '', targetRole: '', education: [], skills: [], summary: '', updatedAt: new Date().toISOString() });
