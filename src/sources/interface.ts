// AccountDataSource boundary. Provider quirks never leak past a source file.
// Money fields are INTEGER CENTS.

export interface Account {
  id: string;
  name: string;
  type: 'CHECKING' | 'SAVINGS' | 'INVESTMENT' | 'CREDIT_CARD';
  isPrimary: boolean;
  ledgerBalanceCents: number;
  availableBalanceCents: number | null; // null when institution doesn't report
}

export interface Transaction {
  id: string;
  accountId: string;
  date: Date;
  amountCents: number; // positive = money in, negative = money out
  description: string;
  status: 'PENDING' | 'POSTED';
  holdReleaseDate?: Date; // optional, present if known
}

export interface AccountDataSource {
  getAccounts(): Promise<Account[]>;
  syncTransactions(cursor?: string): Promise<{
    added: Transaction[];
    modified: Transaction[];
    removed: string[];
    nextCursor: string;
  }>;
}
