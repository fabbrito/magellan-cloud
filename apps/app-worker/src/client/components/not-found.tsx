import { Link } from "@tanstack/react-router";

import { buttonVariants } from "~/client/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "~/client/components/ui/empty";

// Every page the router cannot place, and every device the API does not know.
export function NotFound() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>Not found</EmptyTitle>
        <EmptyDescription>Nothing lives at this address.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        {/* A link, not a button: it navigates. Styled as one, so it reads as the way out. */}
        <Link to="/" className={buttonVariants({ variant: "outline" })}>
          All devices
        </Link>
      </EmptyContent>
    </Empty>
  );
}
