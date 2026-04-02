import { IPgxReportData } from './report-pgx-data.interface';

export interface IPgxTemplateGroup {
	drug_response_category: string;
	rows: IPgxReportData[];
}

export interface IPgxTemplateData {
	patient_no: string;
	patient_name: string;
	dob: string;
	gender: string;
	ethnicity: string;
	physician_name: string;
	specimen: string;
	received_date: string;
	prepared_by: string;
	report_date: string;
	groups: IPgxTemplateGroup[];
}
