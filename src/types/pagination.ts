/**
 * ERP Manajemen - Pagination and Filtering Types
 */

export interface PaginationParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: "active" | "inactive" | "all";
  categoryId?: number;
  branchId?: number;
  sortBy?: string;
  sortOrder?: "ASC" | "DESC";
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: PaginationMeta;
}
