import { z } from 'zod';
import { roleCategories } from './role-taxonomy';

export const roleCategoryIdSchema = z.enum(roleCategories.map(category => category.id));
export const classificationOutputSchema = z.object({ categoryId: roleCategoryIdSchema, confidence: z.enum(['high', 'medium', 'low']), reason: z.string().min(1).max(1200), evidence: z.array(z.string().min(1).max(1200)).max(4) });
export const storedClassificationSchema = classificationOutputSchema.extend({ inputVersion: z.string().min(1).max(100), classifiedAt: z.string().refine(value => Number.isFinite(Date.parse(value))) });
