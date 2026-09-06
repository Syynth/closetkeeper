/**
 * The stock filter, held once for the whole signed-in app so that walking
 * from the shelves into a category and back keeps what you were looking at.
 * Deliberately not in the URL: the filter is a view of the room you are
 * standing in, not a place you want to bookmark or share.
 */
import { createContext, type ReactNode, useContext, useState } from "react";
import { NO_FILTER, type StockFilter } from "./inventory";

interface FilterContextValue {
	filter: StockFilter;
	setFilter: (next: StockFilter) => void;
}

const FilterContext = createContext<FilterContextValue>({
	filter: NO_FILTER,
	setFilter: () => {},
});

export function StockFilterProvider({ children }: { children: ReactNode }) {
	const [filter, setFilter] = useState<StockFilter>(NO_FILTER);
	return (
		<FilterContext.Provider value={{ filter, setFilter }}>
			{children}
		</FilterContext.Provider>
	);
}

export function useStockFilter() {
	return useContext(FilterContext);
}
